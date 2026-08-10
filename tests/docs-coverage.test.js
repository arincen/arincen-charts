import './support/full-build.js';
import './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as library from '../src/full.js';

/**
 * Nothing public is left out of the documentation.
 *
 * Written after a spot check found seventy-two of three hundred and forty-three
 * public identifiers undocumented — a whole category at a time, not scattered
 * omissions: every crosshair-marker option, every base-line option, the point
 * markers, four price-scale options, three localization formatters. Each was
 * missed the same way, by writing prose about what a page is *for* and never
 * walking the list of what actually exists.
 *
 * Prose cannot be audited by reading it, because the thing you are looking for
 * is the thing that is not there. So the list is taken from the running library
 * and checked against the pages, and a new option is undocumented until someone
 * writes it down.
 *
 * This asserts coverage, not quality. A name in a table satisfies it; only a
 * reader can tell whether the sentence beside it is worth anything.
 */

const docsRoot = fileURLToPath(new URL('../docs', import.meta.url));

function markdown(directory) {
    return readdirSync(directory).flatMap((entry) => {
        if (['node_modules', '.vitepress', 'dist'].includes(entry)) {
            return [];
        }

        const path = join(directory, entry);

        return statSync(path).isDirectory()
            ? markdown(path)
            : (entry.endsWith('.md') ? [path] : []);
    });
}

const pages = markdown(docsRoot).map((path) => readFileSync(path, 'utf8'));
const prose = pages.join('\n');

/**
 * Only the code the pages actually run.
 *
 * Being mentioned in a table is not the same as being shown working. The
 * first audit of this said every name was documented and forty per cent of
 * them appeared in a fence nobody executes — which is how a page can describe
 * an option that no longer does anything and still read perfectly.
 */
const demonstrated = pages.map((page) => {
    const lines = page.split('\n');
    const kept = [];

    let inDemo = false;
    let inFence = false;

    for (const line of lines) {
        if (line.startsWith('<ChartDemo')) {
            inDemo = true;
            inFence = false;

            continue;
        }

        if (line.startsWith('</ChartDemo>')) {
            inDemo = false;

            continue;
        }

        if (! inDemo) {
            continue;
        }

        if (! inFence && /^```(js|javascript)\s*$/.test(line)) {
            inFence = true;

            continue;
        }

        if (inFence && line.startsWith('```')) {
            inFence = false;

            continue;
        }

        if (inFence) {
            kept.push(line);
        }
    }

    return kept.join('\n');
}).join('\n');

const engineRoot = fileURLToPath(new URL('../src', import.meta.url));

const source = (file) => readFileSync(join(engineRoot, file), 'utf8');

/**
 * Names a plugin author has to know, scraped from the code that reads them.
 *
 * A primitive is a shape rather than an object the library owns, so there is
 * nothing to enumerate with `Object.keys` — the contract exists only as the set
 * of properties the engine reaches for. Deriving it from those call sites means
 * a hook added to the engine is undocumented the moment it is added, which is
 * the same guarantee the enumerable half of this file already gives.
 *
 * @param {string} file
 * @param {RegExp} pattern one capture group: the property name
 * @return {string[]}
 */
function reachedFor(file, pattern) {
    return [...new Set([...source(file).matchAll(pattern)].map((match) => match[1]))].sort();
}

const chart = library.createChart(document.createElement('div'), { width: 600, height: 300 });

const SERIES = [
    'LineSeries', 'AreaSeries', 'BaselineSeries',
    'CandlestickSeries', 'BarSeries', 'HistogramSeries',
];

/** @returns {Map<string, string[]>} kind → identifiers that ought to be written down. */
function surface() {
    const found = new Map();
    const add = (kind, name) => {
        const list = found.get(kind) ?? [];

        if (! list.includes(name)) {
            list.push(name);
        }

        found.set(kind, list);
    };

    Object.keys(library).forEach((name) => add('export', name));

    const line = chart.addSeries(library.LineSeries, {});

    const objects = {
        ChartApi: chart,
        SeriesApi: line,
        TimeScaleApi: chart.timeScale(),
        PriceScaleApi: chart.priceScale(),
        PaneApi: chart.panes()[0],
    };

    for (const [kind, object] of Object.entries(objects)) {
        Object.keys(object)
            .filter((key) => ! key.startsWith('_'))
            .forEach((key) => add(kind, key));
    }

    chart.removeSeries(line);

    // Options are nested, and it is the leaf that a reader searches for.
    const walk = (branch, kind) => {
        for (const [key, value] of Object.entries(branch ?? {})) {
            if (value && typeof value === 'object' && ! Array.isArray(value)) {
                walk(value, kind);
            } else {
                add(kind, key);
            }
        }
    };

    walk(chart.options(), 'chart option');

    for (const name of SERIES) {
        const series = chart.addSeries(library[name], {});

        walk(series.options(), 'series option');
        chart.removeSeries(series);
    }

    for (const name of ['LineStyle', 'LineType', 'CrosshairMode', 'PriceScaleMode', 'PriceLineSource', 'LastPriceAnimationMode']) {
        Object.keys(library[name])
            .filter((key) => Number.isNaN(Number(key)))
            .forEach((key) => add(name, key));
    }

    const priceLine = chart.addSeries(library.LineSeries, {}).createPriceLine({ price: 1 });

    Object.keys(priceLine.options()).forEach((key) => add('price line option', key));

    // The plugin surface. Not enumerable — a primitive is a shape the engine
    // reads, not an object it hands out — so it comes from the call sites.
    reachedFor('chart.js', /\bprimitive\.([a-zA-Z]+)\s*(?:\?\.)?[.(]/g)
        .forEach((name) => add('primitive hook', name));

    ['paneViews', 'priceAxisPaneViews', 'timeAxisPaneViews']
        .forEach((name) => add('primitive hook', name));

    reachedFor('chart.js', /\bview\.([a-zA-Z]+)\s*(?:\?\.)?\(/g)
        .forEach((name) => add('axis view method', name));

    reachedFor('markers.js', /\bmarker\.([a-zA-Z]+)\b/g)
        .forEach((name) => add('marker field', name));

    reachedFor('custom-series.js', /\b(?:paneView|view)\.([a-zA-Z]+)\s*(?:\?\.)?[.(]/g)
        .forEach((name) => add('custom series hook', name));

    ['useBitmapCoordinateSpace', 'useMediaCoordinateSpace']
        .forEach((name) => add('render target', name));

    ['context', 'bitmapSize', 'mediaSize', 'horizontalPixelRatio', 'verticalPixelRatio']
        .forEach((name) => add('render target', name));

    ['externalId', 'cursorStyle', 'zOrder', 'distance', 'hitTestPriority']
        .forEach((name) => add('hit result field', name));

    return found;
}

const expected = surface();

/**
 * The scrapers found something.
 *
 * A regular expression that matches nothing produces an empty list, and an
 * empty list is trivially fully documented — a green test proving nothing. Each
 * derived group is therefore checked for a plausible size before its contents
 * are checked at all.
 */
test('every derived group actually found its contract', () => {
    const floors = {
        'primitive hook': 8,
        'axis view method': 5,
        'marker field': 5,
        'custom series hook': 4,
        'price line option': 7,
    };

    for (const [kind, floor] of Object.entries(floors)) {
        const found = expected.get(kind) ?? [];

        assert.ok(
            found.length >= floor,
            `only scraped ${found.length} ${kind}(s), expected at least ${floor} — `
                + 'the pattern stopped matching, so this group is passing for the wrong reason',
        );
    }
});

test('the documented surface is large enough to be worth checking', () => {
    const total = [...expected.values()].reduce((sum, list) => sum + list.length, 0);

    // Two hundred rather than a number close to today's count: this guard is
    // here to catch the walk silently returning nothing, not to be re-tuned
    // every time an option is added or removed.
    assert.ok(total > 200, `only found ${total} public identifiers — the walk is broken, not the docs`);
});

for (const [kind, names] of expected) {
    test(`every ${kind} is documented`, () => {
        const missing = names.filter((name) => ! new RegExp(`\\b${name}\\b`).test(prose));

        assert.deepEqual(
            missing,
            [],
            `undocumented ${kind}(s):\n  ${missing.join('\n  ')}\n\n`
                + 'Add them to the reference pages under docs/api/.',
        );
    });
}

/**
 * Written down is not the same as shown working.
 *
 * The scraped plugin contracts are exempt: a primitive hook is a method the
 * reader writes, not one they call, so it appears in a demo as a property name
 * on an object literal — which this would count, but only by accident. They are
 * covered by the prose checks above and by their own live examples.
 */
const DEMONSTRABLE = [
    'export', 'ChartApi', 'SeriesApi', 'TimeScaleApi', 'PriceScaleApi', 'PaneApi',
    'chart option', 'series option',
];

for (const kind of DEMONSTRABLE) {
    test(`every ${kind} is exercised by a live example`, () => {
        const names = expected.get(kind) ?? [];
        const missing = names.filter((name) => ! new RegExp(`\\b${name}\\b`).test(demonstrated));

        assert.deepEqual(
            missing,
            [],
            `${kind}(s) documented but never run:\n  ${missing.join('\n  ')}\n\n`
                + 'Each needs to appear inside a <ChartDemo> block, where the page executes it.',
        );
    });
}
