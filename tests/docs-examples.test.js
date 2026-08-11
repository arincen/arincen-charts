import './support/full-build.js';
import './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as library from '../src/full.js';

/**
 * Every live example in the documentation, executed.
 *
 * The docs site runs the code block it prints — the page reads the block out of
 * itself and evaluates it, so what a reader copies is provably what drew the
 * chart above it. That removes drift between an example and its output, but it
 * moves the failure to the reader's browser: a snippet that stops working is
 * discovered by whoever opens the page.
 *
 * This closes it. The same blocks are pulled out of the markdown and run here
 * against a real chart, so an option renamed in the engine breaks the build
 * rather than the documentation. Docs that are only proofread go stale; docs
 * that are executed cannot.
 */

const docsRoot = fileURLToPath(new URL('../docs', import.meta.url));

/** @returns {string[]} every markdown file under the docs package. */
function markdownFiles(directory) {
    return readdirSync(directory).flatMap((entry) => {
        if (entry === 'node_modules' || entry === '.vitepress' || entry === 'dist') {
            return [];
        }

        const path = join(directory, entry);

        if (statSync(path).isDirectory()) {
            return markdownFiles(path);
        }

        return entry.endsWith('.md') ? [path] : [];
    });
}

/**
 * The first fenced JavaScript block inside each `<ChartDemo>` on a page.
 *
 * Mirrors what the component does at runtime: it takes the code element inside
 * its own slot, which is the first fence between the opening and closing tags.
 *
 * @returns {{ line: number, code: string }[]}
 */
function demoBlocks(source) {
    const found = [];
    const lines = source.split('\n');

    let inDemo = false;
    let fence = null;

    lines.forEach((line, index) => {
        if (line.startsWith('<ChartDemo')) {
            inDemo = true;
            fence = null;

            return;
        }

        if (line.startsWith('</ChartDemo>')) {
            inDemo = false;

            return;
        }

        if (! inDemo) {
            return;
        }

        if (fence === null && /^```(js|javascript)\s*$/.test(line)) {
            fence = { line: index + 1, body: [] };

            return;
        }

        if (fence && ! fence.closed) {
            if (line.startsWith('```')) {
                fence.closed = true;
                found.push({ line: fence.line, code: fence.body.join('\n') });

                return;
            }

            fence.body.push(line);
        }
    });

    return found;
}

/** The sample bars the docs component hands every snippet as `data`. */
function sampleData() {
    const day = 24 * 60 * 60;
    const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);
    const bars = [];

    let price = 100;
    let seed = 20240101;

    for (let index = 0; index < 180; index++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;

        const noise = seed / 0x7fffffff - 0.5;
        const open = price;
        const close = open + noise * 2.4 + Math.sin(index / 18) * 0.9;

        bars.push({
            time: start + index * day,
            open,
            close,
            high: Math.max(open, close) + Math.abs(noise) * 1.4,
            low: Math.min(open, close) - Math.abs(noise) * 1.4,
            value: close,
        });

        price = close;
    }

    return bars;
}

/**
 * Counts marks on the canvas, so "it ran" is not mistaken for "it drew".
 *
 * A count alone cannot tell a working example from an empty one — a chart with
 * no series still draws a grid and a frame. An earlier version of this test
 * compared against what an empty chart draws, which broke the moment a page
 * documented a sparkline: that example switches off the grid, both axes and the
 * crosshair, so it legitimately draws *fewer* marks than an empty chart while
 * being perfectly correct.
 *
 * So the two questions are asked separately below: did anything reach the
 * canvas, and did the example actually put readings into a series.
 */
function drawCounting(chart) {
    let drawn = 0;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
    }, {
        get: (target, key) => {
            if (key in target) {
                return target[key];
            }

            return ['fillRect', 'strokeRect', 'stroke', 'fill', 'fillText'].includes(key)
                ? () => { drawn++; }
                : () => {};
        },
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return drawn;
}

/**
 * How many readings the example loaded, across every chart it touched.
 *
 * Not just the chart the runner handed it: a recipe about two synchronised
 * charts builds both of them itself, leaving the given chart empty and
 * perfectly correct. Counting only that one reported the recipe as broken.
 *
 * @param {object[]} charts
 */
function readingsDrawn(charts) {
    return charts.reduce(
        (total, chart) => total + chart._internal.allSeries.reduce((sum, s) => sum + s.points.length, 0),
        0,
    );
}

const pages = markdownFiles(docsRoot)
    .map((path) => ({ path, blocks: demoBlocks(readFileSync(path, 'utf8')) }))
    .filter((page) => page.blocks.length);

test('the documentation has live examples to check', () => {
    assert.ok(pages.length >= 3, 'expected several pages carrying <ChartDemo> blocks');
});

pages.forEach((page) => {
    const name = page.path.slice(docsRoot.length + 1);

    page.blocks.forEach((block, index) => {
        test(`${name} example ${index + 1} (line ${block.line}) runs and draws`, () => {
            const container = document.createElement('div');
            const chart = library.createChart(container, { width: 600, height: 300 });

            // Same call shape as the docs component: the library spread into
            // scope so an example reads the way a reader's own file would.
            const cleanups = [];
            const built = [chart];

            // Charts the snippet makes for itself are counted too — see
            // `readingsDrawn`.
            const scope = {
                ...library,
                createChart: (element, options) => {
                    const made = library.createChart(element, options);

                    built.push(made);

                    return made;
                },

                // A preset builds its chart with the `createChart` it imported
                // itself, not the one above, so the chart it draws into is
                // invisible here — the recipe read as "ran but drew nothing"
                // while being perfectly correct.
                sparkline: (...args) => {
                    const made = library.sparkline(...args);

                    built.push(made.chart);

                    return made;
                },
            };

            /**
             * The same `ui` the docs component hands a snippet. Headless, but
             * it has to exist and return elements: a demo that calls
             * `ui.button` would otherwise pass here and throw on the page,
             * which is the one failure this file exists to prevent.
             */
            const pressed = [];
            const ui = {
                button: (label, onClick) => {
                    const element = document.createElement('button');

                    element.textContent = label;
                    pressed.push(onClick);

                    return element;
                },
                options: (labels, onChoose) => ({
                    choose: () => {},
                    buttons: labels.map((label) => ui.button(label, () => onChoose(0))),
                }),
                readout: (text = '') => {
                    const element = document.createElement('pre');

                    element.textContent = text;

                    return element;
                },
            };

            const run = new Function(
                'chart', 'container', 'lib', 'data', 'onCleanup', 'ui',
                ...Object.keys(scope),
                `"use strict";\n${block.code}`,
            );

            run(
                chart,
                container,
                scope,
                sampleData(),
                (fn) => cleanups.push(fn),
                ui,
                ...Object.values(scope),
            );

            // Every button, once. A handler that throws is a demo that looks
            // fine until somebody presses it — which is exactly how the last
            // three of these shipped broken.
            pressed.forEach((press) => press());

            const readings = readingsDrawn(built);
            const marks = built.reduce((total, made) => total + drawCounting(made), 0);

            assert.ok(
                readings > 0,
                `${name}:${block.line} ran but left every series empty`,
            );
            assert.ok(
                marks > 0,
                `${name}:${block.line} has ${readings} readings and drew nothing`,
            );

            cleanups.forEach((fn) => fn());
            chart.remove();
        });
    });
});
