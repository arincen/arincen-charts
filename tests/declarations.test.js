import './support/full-build.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The published contract, checked against what is published.
 *
 * This has now gone wrong three times in the same shape: `BaselineSeries` was
 * implemented and never exported, `LineType` likewise, and every one of the
 * seventeen viewport methods worked while the type declarations said none of
 * them existed. Each was invisible to every other test, because each is a
 * question about what leaves the building rather than what happens inside it.
 *
 * A method a TypeScript user's editor says does not exist may as well not.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (name) => readFileSync(join(root, name), 'utf8');

const types = read('types.js');
const index = read('index.js');
const standalone = read('standalone.js');
const full = read('full.js');
const standaloneFull = read('standalone-full.js');

/** Everything a caller can reach, and where it has to be declared. */
const SURFACE = {
    'the time scale': [
        'fitContent', 'applyOptions', 'scrollToRealTime', 'getVisibleRange', 'getVisibleLogicalRange',
        'timeToCoordinate', 'coordinateToTime', 'setVisibleRange', 'setVisibleLogicalRange',
        'scrollPosition', 'scrollToPosition', 'resetTimeScale', 'coordinateToLogical',
        'logicalToCoordinate', 'timeToIndex', 'width', 'height', 'subscribeSizeChange',
    ],
    'a series': [
        'setData', 'update', 'data', 'setMarkers', 'attachPrimitive', 'detachPrimitive',
        'createPriceLine', 'priceToCoordinate', 'coordinateToPrice', 'barsInLogicalRange',
        'dataByIndex', 'priceFormatter', 'subscribeDataChanged', 'pop', 'seriesOrder', 'setSeriesOrder',
    ],
    'the chart': [
        'addSeries', 'removeSeries', 'resize', 'remove', 'timeScale', 'priceScale',
        'subscribeCrosshairMove', 'subscribeClick', 'subscribeDblClick', 'autoSizeActive',
        'setCrosshairPosition', 'clearCrosshairPosition', 'paneSize',
        'takeScreenshot', 'chartElement',
    ],
};

for (const [area, members] of Object.entries(SURFACE)) {
    test(`every method on ${area} is declared`, () => {
        const missing = members.filter((member) => ! types.includes(`} ${member}`));

        assert.deepEqual(missing, [], `undeclared, so a typed caller cannot see them: ${missing.join(', ')}`);
    });
}

/**
 * Enums are the other half of the same mistake: an implemented enum nobody
 * exported is how `BaselineSeries` reached a script tag as undefined.
 */
test('every enum a caller needs is exported from the light entries', () => {
    for (const name of ['LineStyle', 'LineType', 'PriceLineSource', 'CrosshairMode', 'PriceScaleMode']) {
        assert.ok(index.includes(name), `${name} is missing from the module entry`);
        assert.ok(standalone.includes(name), `${name} is missing from the script-tag entry`);
    }
});

test('every series type is exported from the light entries', () => {
    for (const name of ['LineSeries', 'AreaSeries', 'BaselineSeries', 'CandlestickSeries', 'BarSeries', 'HistogramSeries']) {
        assert.ok(index.includes(name), `${name} is missing from the module entry`);
        assert.ok(standalone.includes(name), `${name} is missing from the script-tag entry`);
    }
});

/**
 * Full-build extras must be exported from both full entries and from neither
 * light one — the split is the product, and a light bundle quietly carrying
 * them would be the claim failing rather than a feature arriving.
 */
test('full-build extras are in both full entries and in neither light one', () => {
    for (const name of ['createTextWatermark', 'createImageWatermark', 'createUpDownMarkers']) {
        assert.ok(full.includes(name), `${name} is missing from the full module entry`);
        assert.ok(standaloneFull.includes(name), `${name} is missing from the full script-tag entry`);
        assert.ok(! index.includes(name), `${name} leaked into the light module entry`);
        assert.ok(! standalone.includes(name), `${name} leaked into the light script-tag entry`);
    }
});
