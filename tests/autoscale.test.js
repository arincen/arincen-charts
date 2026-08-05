import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesPriceRange, applyAutoscaleProvider } from '../src/chart.js';
import { trackingPoint } from '../src/touch.js';
import { createTextWatermark } from '../src/watermark.js';

const lineSeries = (values, options = {}) => ({
    definition: { isBarLike: false },
    options,
    byIndex: values.map((value) => (value === null ? null : { value })),
});

const barSeries = (bars) => ({
    definition: { isBarLike: true },
    options: {},
    byIndex: bars.map(([low, high]) => ({ low, high, value: high })),
});

test('a line series is ranged on its values', () => {
    assert.deepEqual(seriesPriceRange(lineSeries([10, 30, 20]), 0, 2), { minValue: 10, maxValue: 30 });
});

test('a bar series is ranged on its lows and highs, not its closes', () => {
    assert.deepEqual(seriesPriceRange(barSeries([[8, 12], [9, 20]]), 0, 1), { minValue: 8, maxValue: 20 });
});

test('only the visible slice counts', () => {
    assert.deepEqual(seriesPriceRange(lineSeries([1, 50, 3, 4]), 2, 3), { minValue: 3, maxValue: 4 });
});

test('a series with nothing on screen has no range at all', () => {
    assert.equal(seriesPriceRange(lineSeries([null, null]), 0, 1), null);
});

/**
 * A histogram is read against its base, so the base belongs on the axis
 * whether or not a bar reaches it — otherwise volume bars are cut off at the
 * bottom instead of standing on a zero line.
 */
test('a histogram base is on the axis even when no bar reaches it', () => {
    const range = seriesPriceRange(lineSeries([800, 5000], { base: 0 }), 0, 1);

    assert.deepEqual(range, { minValue: 0, maxValue: 5000 });
});

test('a provider that ignores the default replaces it', () => {
    const series = lineSeries([10, 30], { autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });

    assert.deepEqual(applyAutoscaleProvider(series, { minValue: 10, maxValue: 30 }), { minValue: 0, maxValue: 100 });
});

test('a provider is handed a function, so widening the default costs nothing to skip', () => {
    let asked = 0;
    const series = lineSeries([10, 30], {
        autoscaleInfoProvider: (base) => {
            asked++;

            const { priceRange } = base();

            return { priceRange: { minValue: priceRange.minValue - 5, maxValue: priceRange.maxValue + 5 } };
        },
    });

    assert.deepEqual(applyAutoscaleProvider(series, { minValue: 10, maxValue: 30 }), { minValue: 5, maxValue: 35 });
    assert.equal(asked, 1);
});

test('margins are fractions of the range, added outside it', () => {
    const series = lineSeries([0, 100], {
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 0.1, below: 0.2 } }),
    });

    assert.deepEqual(applyAutoscaleProvider(series, { minValue: 0, maxValue: 100 }), { minValue: -20, maxValue: 110 });
});

test('a provider that throws leaves the range as it was', () => {
    const series = lineSeries([10, 30], {
        autoscaleInfoProvider: () => {
            throw new Error('bad provider');
        },
    });

    assert.deepEqual(applyAutoscaleProvider(series, { minValue: 10, maxValue: 30 }), { minValue: 10, maxValue: 30 });
});

test('a provider returning nothing usable is ignored rather than trusted', () => {
    for (const result of [null, {}, { priceRange: null }, { priceRange: { minValue: Number.NaN, maxValue: 1 } }]) {
        const series = lineSeries([10, 30], { autoscaleInfoProvider: () => result });

        assert.deepEqual(applyAutoscaleProvider(series, { minValue: 10, maxValue: 30 }), { minValue: 10, maxValue: 30 });
    }
});

/* ---------------------------------------------------------------- touch */

test('a tracked crosshair sits above the finger, not under it', () => {
    const rect = { left: 20, top: 50 };

    assert.deepEqual(trackingPoint({ clientX: 120, clientY: 300 }, rect), { x: 100, y: 206 });
});

test('a touch near the top clamps rather than going off the chart', () => {
    assert.deepEqual(trackingPoint({ clientX: 10, clientY: 55 }, { left: 0, top: 50 }), { x: 10, y: 0 });
});

/* ------------------------------------------------------------ watermark */

function drawWatermark(options) {
    const drawn = [];
    const context = {
        save() {}, restore() {},
        set font(value) {}, set fillStyle(value) {}, set textAlign(value) {}, set textBaseline(value) {},
        fillText: (text, x, y) => drawn.push({ text, x, y }),
    };

    createTextWatermark(options).paneViews()[0].renderer().draw({
        useMediaCoordinateSpace: (callback) => callback({ context, mediaSize: { width: 400, height: 200 } }),
    });

    return drawn;
}

test('a watermark is centred by default', () => {
    const [drawn] = drawWatermark({ text: 'Arincen' });

    assert.equal(drawn.text, 'Arincen');
    assert.deepEqual([drawn.x, drawn.y], [200, 100]);
});

test('a watermark can be pinned to a corner', () => {
    const [drawn] = drawWatermark({ text: 'Arincen', horzAlign: 'left', vertAlign: 'bottom', fontSize: 20 });

    assert.deepEqual([drawn.x, drawn.y], [10, 190]);
});

test('an empty or hidden watermark draws nothing', () => {
    assert.equal(drawWatermark({ text: '' }).length, 0);
    assert.equal(drawWatermark({ text: 'Arincen', visible: false }).length, 0);
});

test('a watermark sits beneath the series it labels', () => {
    assert.equal(createTextWatermark({ text: 'x' }).paneViews()[0].zOrder(), 'bottom');
});
