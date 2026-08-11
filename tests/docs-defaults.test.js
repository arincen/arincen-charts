import './support/full-build.js';
import './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as library from '../src/full.js';

/**
 * Every default written in the reference tables is the default.
 *
 * The coverage guard checks that an option is *named* somewhere and shown
 * running. It says nothing about the value in the second column, and that
 * column is where a reference page rots: the defaults moved and eighteen rows
 * went on describing the old ones, in tables whose entire purpose is to be
 * quoted rather than read.
 *
 * A wrong default is worse than a missing one. A reader who cannot find a
 * default goes and looks; a reader who finds the wrong one writes code around
 * it.
 *
 * Rows whose value is prose — "the system stack", "see below", an em dash —
 * are skipped rather than guessed at. Only a backticked literal is a claim.
 */

const docsRoot = fileURLToPath(new URL('../docs', import.meta.url));

// No size passed: `width` and `height` default to 0, and giving the chart a
// size here would make it report what this test asked for as the default.
const chart = library.createChart(document.createElement('div'), {});

const SERIES = {
    LineSeries: 'LineSeries',
    AreaSeries: 'AreaSeries',
    BaselineSeries: 'BaselineSeries',
    CandlestickSeries: 'CandlestickSeries',
    BarSeries: 'BarSeries',
    HistogramSeries: 'HistogramSeries',
};

/** Every leaf of the chart's option tree, by its dotted path and by its name. */
function flatten(branch, prefix = '', into = new Map()) {
    for (const [key, value] of Object.entries(branch ?? {})) {
        const path = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object' && ! Array.isArray(value)) {
            // `scaleMargins` is documented as a whole object, so it is recorded
            // as a value in its own right as well as walked into.
            into.set(path, value);
            flatten(value, path, into);
        } else {
            into.set(path, value);
        }
    }

    return into;
}

const chartOptions = flatten(chart.options());

/**
 * Series defaults, as a set of values per name.
 *
 * A set rather than one value, because a name does not mean one thing across
 * the seven: `color` is the line's pink and the histogram's green, and both
 * are documented, each in its own section. Collapsing them to whichever series
 * was built first failed a row that was perfectly correct.
 */
const seriesOptions = new Map();

for (const name of Object.keys(SERIES)) {
    const series = chart.addSeries(library[name], {});

    for (const [key, value] of flatten(series.options())) {
        seriesOptions.set(key, [...(seriesOptions.get(key) ?? []), value]);
    }

    chart.removeSeries(series);
}

/**
 * What the library actually has for a name, or `undefined` if it has nothing.
 *
 * A documented name is looked up as a full path first — `layout.textColor` —
 * then as a bare leaf, because the tables use whichever reads better in the
 * column. Bare lookups take the last segment of every known path.
 */
const chartLeaves = new Map();

for (const [path, value] of chartOptions) {
    const leaf = path.split('.').pop();

    // Every value, not the first: `mode` is the crosshair's and both price
    // scales', each documented in its own section. Keeping one made the other
    // sections' rows fail against a value from a different part of the tree.
    //
    // An option that exists but is undefined by default tells us nothing.
    if (value !== undefined) {
        chartLeaves.set(leaf, [...(chartLeaves.get(leaf) ?? []), value]);
    }
}

const seriesLeaves = new Map();

for (const [path, values] of seriesOptions) {
    const leaf = path.split('.').pop();
    const defined = values.filter((value) => value !== undefined);

    if (defined.length) {
        seriesLeaves.set(leaf, [...(seriesLeaves.get(leaf) ?? []), ...defined]);
    }
}

/**
 * Every value the library gives this name, from all of them.
 *
 * The union rather than the first match: `color` is `layout.background.color`,
 * a line's stroke and a histogram's fill, and stopping at the first meant
 * comparing a documented series colour against the chart's white background.
 *
 * A dotted path is exact and is answered on its own. A bare name is inherently
 * ambiguous in these tables — the same word heads a row in four sections — so
 * it passes if it matches any of them. That is weaker than an exact check and
 * still catches the failure this exists for: a value that is nobody's default,
 * which is what a stale table row always is.
 */
/**
 * Price lines carry their own options, and several share a leaf name with a
 * series' — `lineWidth` is 1 on a price line and 3 on a line series, and both
 * are documented. Folded into the same union so a row describing one is not
 * failed against the other.
 */
const lineOptions = new Map();

{
    const holder = chart.addSeries(library.LineSeries, {});
    const line = holder.createPriceLine({ price: 1 });

    for (const [key, value] of Object.entries(line.options())) {
        if (value !== undefined) {
            lineOptions.set(key, [...(lineOptions.get(key) ?? []), value]);
        }
    }

    chart.removeSeries(holder);
}

function resolve(name) {
    if (name.includes('.')) {
        return chartOptions.has(name)
            ? { found: true, values: [chartOptions.get(name)] }
            : { found: false };
    }

    const values = [
        ...(chartOptions.has(name) ? [chartOptions.get(name)] : []),
        ...(chartLeaves.get(name) ?? []),
        ...(seriesLeaves.get(name) ?? []),
        ...(lineOptions.get(name) ?? []),
    ].filter((value) => value !== undefined);

    return values.length ? { found: true, values } : { found: false };
}

/**
 * The value a table cell claims, or null when the cell is prose.
 *
 * `'#db2777'` and `{ top: 0.16, bottom: 0.12 }` are claims. "the system stack"
 * and "—" are not, and inventing a comparison for them would only produce
 * noise a reader would learn to ignore.
 */
function claimed(cell) {
    const literal = cell.trim().match(/^`([^`]+)`$/)?.[1];

    if (! literal) {
        return null;
    }

    // `LineStyle.Dotted` is as much a claim as `4`, and it is how every enum
    // default is written. Left unresolved these read as prose and were skipped,
    // so a crosshair documented as LargeDashed survived being changed to Dotted.
    const member = literal.match(/^([A-Z][A-Za-z]+)\.([A-Za-z][A-Za-z0-9]*)$/);

    if (member && library[member[1]] && member[2] in library[member[1]]) {
        return { value: library[member[1]][member[2]] };
    }

    try {
        // Object and array literals, plus quoted strings, numbers and booleans.
        // eslint-disable-next-line no-new-func
        return { value: new Function(`"use strict"; return (${literal});`)() };
    } catch {
        return null;
    }
}

/**
 * Every page, not only the reference.
 *
 * A defaults table is a defaults table wherever it appears, and the guides
 * carry several. Checking only `api/` left `layout.textColor` on the
 * localization page saying `#191919` long after the value had changed — the
 * exact rot this test exists to stop, in a file it was not looking at.
 */
const PAGES = readdirSync(docsRoot, { recursive: true })
    .filter((entry) => String(entry).endsWith('.md'))
    .map(String);

/** @returns {{page: string, line: number, name: string, value: unknown}[]} */
function documentedDefaults() {
    const rows = [];

    for (const page of PAGES) {
        readFileSync(`${docsRoot}/${page}`, 'utf8').split('\n').forEach((line, index) => {
            const cells = line.split('|');

            // `| name | default | note |` — a table row, not a separator.
            if (cells.length < 4 || /^\s*\|[\s|:-]*\|\s*$/.test(line)) {
                return;
            }

            const name = cells[1].trim().match(/^`([^`]+)`$/)?.[1];

            if (! name || name.includes(' ') || name.includes('/')) {
                return;
            }

            const value = claimed(cells[2]);

            if (value) {
                rows.push({ page, line: index + 1, name, value: value.value });
            }
        });
    }

    return rows;
}

const rows = documentedDefaults();

test('the reference tables state enough defaults to be worth checking', () => {
    assert.ok(
        rows.length > 40,
        `only read ${rows.length} documented defaults — the table parser is broken, not the docs`,
    );
});

test('every documented default matches the library', () => {
    const wrong = [];

    for (const row of rows) {
        const actual = resolve(row.name);

        if (! actual.found) {
            continue;   // Covered by docs-coverage; not this test's business.
        }

        // A row documenting an object default is not describing a numeric
        // option that happens to share its last word. `style` is a number on
        // the crosshair and an object on the tooltip, and the tooltip's is not
        // reachable from here at all.
        const comparable = actual.values.filter((value) => typeof value === typeof row.value);

        if (! comparable.length) {
            continue;
        }

        const wanted = JSON.stringify(row.value);
        const same = comparable.some((value) => JSON.stringify(value) === wanted);

        if (! same) {
            wrong.push(
                `${row.page}:${row.line}  ${row.name}`
                + `\n      says   ${wanted}`
                + `\n      is     ${comparable.map((value) => JSON.stringify(value)).join(' or ')}`,
            );
        }
    }

    assert.deepEqual(wrong, [], `documented defaults that are not the defaults:\n  ${wrong.join('\n  ')}`);
});
