import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceScale } from '../src/scales.js';

const scaleOptions = (overrides = {}) => ({
    scaleMargins: { top: 0, bottom: 0 },
    mode: 0,
    ...overrides,
});

function scaleOver(min, max, height = 400) {
    const scale = new PriceScale(scaleOptions());

    scale.setViewport(0, height);
    scale.setRange(min, max);

    return scale;
}

test('prices map to the top and bottom of the viewport', () => {
    const scale = scaleOver(10, 20);

    assert.equal(scale.priceToY(20), 0);
    assert.equal(scale.priceToY(10), 400);
    assert.equal(scale.priceToY(15), 200);
});

test('a coordinate turns back into the price it came from', () => {
    const scale = scaleOver(10, 20);

    for (const price of [10, 12.5, 15, 19.99]) {
        assert.ok(Math.abs(scale.yToPrice(scale.priceToY(price)) - price) < 1e-9);
    }
});

test('scale margins keep the series off the edges', () => {
    const scale = new PriceScale(scaleOptions({ scaleMargins: { top: 0.25, bottom: 0.25 } }));

    scale.setViewport(0, 400);
    scale.setRange(0, 100);

    assert.equal(scale.priceToY(100), 100);
    assert.equal(scale.priceToY(0), 300);
});

test('an empty range is padded rather than collapsing to a division by zero', () => {
    const scale = scaleOver(50, 50);

    assert.ok(scale.max > scale.min);
    assert.ok(Number.isFinite(scale.priceToY(50)));
});

test('a non-finite range falls back instead of poisoning every coordinate', () => {
    const scale = scaleOver(Number.NaN, 20);

    assert.equal(scale.min, 0);
    assert.equal(scale.max, 1);
});

/**
 * The step used to be derived from a rounded target tick count, which could
 * nudge the raw step past a rung of the 1/2/2.5/5 ladder and double the real
 * gap — an axis of 0.5 steps silently became one of 1.0 steps.
 */
test('tick steps come from the smallest readable gap, not a rounded count', () => {
    const scale = scaleOver(23, 28, 400);
    const ticks = scale.ticks();
    const steps = ticks.slice(1).map((tick, index) => tick.price - ticks[index].price);

    assert.ok(ticks.length >= 4, `expected several ticks, got ${ticks.length}`);

    for (const step of steps) {
        assert.ok(Math.abs(step - steps[0]) < 1e-9, 'a linear axis steps evenly');
    }

    assert.ok(steps[0] <= 1, `step ${steps[0]} is coarser than the range deserves`);
});

test('ticks stay inside the axis they were measured for', () => {
    const scale = scaleOver(100, 200, 500);

    for (const tick of scale.ticks()) {
        assert.ok(tick.y >= -1 && tick.y <= 501, `tick at ${tick.price} fell outside the axis`);
        assert.ok(Math.abs(tick.y - scale.priceToY(tick.price)) < 1e-9);
    }
});

test('every tick lands on a round number', () => {
    const scale = scaleOver(1.234, 9.876, 400);
    const ticks = scale.ticks();
    const step = ticks[1].price - ticks[0].price;

    for (const tick of ticks) {
        const multiples = tick.price / step;

        assert.ok(Math.abs(multiples - Math.round(multiples)) < 1e-6, `${tick.price} is not a multiple of ${step}`);
    }
});

/**
 * Prices written as "75" where every other chart on the page says "75.00" read
 * as a different quantity, so precision never drops below two.
 */
test('precision never falls below two decimals', () => {
    const wide = scaleOver(0, 100000, 400);

    wide.ticks();

    assert.equal(wide.precision(), 2);
});

test('precision follows the tick step when the step is finer than a cent', () => {
    const scale = scaleOver(1.0, 1.02, 400);

    scale.ticks();

    assert.ok(scale.precision() > 2, `expected more than two decimals, got ${scale.precision()}`);
});

test('a zero-height axis has no ticks rather than an infinite loop', () => {
    const scale = new PriceScale(scaleOptions());

    scale.setViewport(0, 0);
    scale.setRange(10, 20);

    assert.deepEqual(scale.ticks(), []);
});
