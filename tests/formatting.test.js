import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWithPriceFormat } from '../src/chart.js';
import { BaselineSeries } from '../src/series.js';

const withFormat = (priceFormat) => ({ options: { priceFormat } });

test('a series with no format falls back to the scale precision', () => {
    assert.equal(formatWithPriceFormat(63.3125, undefined, 2), '63.31');
    assert.equal(formatWithPriceFormat(63.3125, withFormat(undefined), 4), '63.3125');
});

test('precision is taken from the series when it asks for one', () => {
    assert.equal(formatWithPriceFormat(1.234567, withFormat({ precision: 5 }), 2), '1.23457');
    assert.equal(formatWithPriceFormat(1.234567, withFormat({ precision: 0 }), 2), '1');
});

/**
 * Rounding to the tick size is what makes `minMove` mean anything: an
 * instrument quoted in quarters should read 63.25 and 63.50, never 63.31.
 */
test('prices snap to the minimum move before their decimals are fixed', () => {
    const quarters = withFormat({ precision: 2, minMove: 0.25 });

    assert.equal(formatWithPriceFormat(63.3125, quarters, 2), '63.25');
    assert.equal(formatWithPriceFormat(63.4, quarters, 2), '63.50');
    assert.equal(formatWithPriceFormat(63.13, quarters, 2), '63.25');
});

test('a zero minimum move leaves the price alone', () => {
    assert.equal(formatWithPriceFormat(63.3125, withFormat({ precision: 4, minMove: 0 }), 2), '63.3125');
});

test('a percent format carries its sign', () => {
    assert.equal(formatWithPriceFormat(12.5, withFormat({ type: 'percent', precision: 1 }), 2), '12.5%');
    assert.equal(formatWithPriceFormat(-3.25, withFormat({ type: 'percent' }), 2), '-3.25%');
});

test('volumes are abbreviated rather than printed in full', () => {
    const volume = withFormat({ type: 'volume' });

    assert.equal(formatWithPriceFormat(950, volume, 2), '950');
    assert.equal(formatWithPriceFormat(12_500, volume, 2), '12.50K');
    assert.equal(formatWithPriceFormat(3_400_000, volume, 2), '3.40M');
    assert.equal(formatWithPriceFormat(2_100_000_000, volume, 2), '2.10B');
});

test('a negative volume keeps its sign and its unit', () => {
    assert.equal(formatWithPriceFormat(-12_500, withFormat({ type: 'volume' }), 2), '-12.50K');
});

/* -------------------------------------------------------------- baseline */

test('the baseline last value takes its colour from which side of the base it is on', () => {
    const options = BaselineSeries.defaults();

    options.baseValue = { type: 'price', price: 100 };

    assert.equal(BaselineSeries.lastValueColor(options, { value: 120 }), options.topLineColor);
    assert.equal(BaselineSeries.lastValueColor(options, { value: 80 }), options.bottomLineColor);
    assert.equal(BaselineSeries.lastValueColor(options, { value: 100 }), options.topLineColor);
});

test('a baseline defaults to a base of zero', () => {
    assert.equal(BaselineSeries.defaults().baseValue.price, 0);
});

/**
 * Both halves are drawn from the same path and clipped, rather than the series
 * being split into two paths at each crossing. The test locks the clipping in:
 * without it the upper colours would paint over the lower half.
 */
test('the two halves are drawn clipped to their own side of the base', () => {
    const clips = [];
    const fills = [];
    let current = null;

    const ctx = {
        set fillStyle(value) { current = value; },
        get fillStyle() { return current; },
        strokeStyle: '',
        lineWidth: 1,
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {},
        setLineDash() {},
        rect(x, y, width, height) { clips.push({ y, height }); },
        clip() {},
        fill() { fills.push(current); },
        createLinearGradient(x0, y0, x1, y1) {
            const stops = [];

            return { addColorStop: (at, colour) => stops.push(colour), stops, from: y0, to: y1 };
        },
    };

    const options = BaselineSeries.defaults();

    options.baseValue = { type: 'price', price: 100 };

    BaselineSeries.draw(ctx, {
        series: { byIndex: [{ value: 120 }, { value: 80 }] },
        options,
        priceScale: { priceToY: (price) => 300 - price },
        timeScale: { indexToX: (index) => index * 10 },
        plot: { left: 0, top: 0, right: 100, bottom: 300 },
        from: 0,
        to: 1,
    });

    assert.equal(clips.length, 2, 'each half should clip to its own region');
    assert.deepEqual(clips[0], { y: 0, height: 200 }, 'the upper half stops at the base');
    assert.deepEqual(clips[1], { y: 200, height: 100 }, 'the lower half starts at the base');
    assert.equal(fills.length, 2);
});
