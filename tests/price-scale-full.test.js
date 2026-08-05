import './support/full-build.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceScale } from '../src/scales.js';
import { FULL_BUILD } from '../src/flags.js';

const LOGARITHMIC = 1;
const PERCENTAGE = 2;

function scaleOver(mode, min, max, height = 400) {
    const scale = new PriceScale({ scaleMargins: { top: 0, bottom: 0 }, mode });

    scale.setViewport(0, height);
    scale.setRange(min, max);

    return scale;
}

test('the flag is on, or none of this file is testing what it claims to', () => {
    assert.equal(FULL_BUILD, true);
});

test('a logarithmic axis compresses the top of the range', () => {
    const scale = scaleOver(LOGARITHMIC, 10, 1000);
    const decade = scale.priceToY(10) - scale.priceToY(100);
    const nextDecade = scale.priceToY(100) - scale.priceToY(1000);

    assert.ok(Math.abs(decade - nextDecade) < 1, 'each ten-fold move should take the same height');
});

/**
 * The defect this locks down: choosing round tick values first and letting the
 * mapping place them yields near-equal gaps over a narrow range, so a correct
 * log axis reads as linear. The step between labels has to grow as prices do.
 */
test('logarithmic tick values step further apart as prices climb', () => {
    const scale = scaleOver(LOGARITHMIC, 20, 400);
    const ticks = scale.ticks();

    assert.ok(ticks.length >= 4, `expected several ticks, got ${ticks.length}`);

    const first = ticks[1].price - ticks[0].price;
    const last = ticks[ticks.length - 1].price - ticks[ticks.length - 2].price;

    assert.ok(last > first, `steps should grow: started at ${first}, ended at ${last}`);
});

/**
 * The narrow range is where this actually broke, and where a wide one proves
 * nothing: over 20 to 400 almost any rule produces growing steps, but over 23
 * to 28 a rule that rounds each step up flattens every gap to the same number
 * and the axis reads as linear despite being mapped correctly.
 */
test('a narrow logarithmic range still steps unevenly', () => {
    const ticks = scaleOver(LOGARITHMIC, 23, 28, 400).ticks();

    assert.ok(ticks.length >= 4, `expected several ticks, got ${ticks.length}`);

    const steps = ticks.slice(1).map((tick, index) => Number((tick.price - ticks[index].price).toFixed(6)));
    const distinct = new Set(steps);

    assert.ok(distinct.size > 1, `every step came out as ${steps[0]} — the axis reads linear`);
    assert.ok(steps[steps.length - 1] > steps[0], `steps ran ${steps[0]} to ${steps[steps.length - 1]}`);
});

/**
 * The walk aims for a 30px gap and then snaps to the nearest rung of the
 * 1/2/2.5/5 ladder, so a landing can fall short of the target — worst case two
 * thirds of it, or 20px, when the raw step sits exactly between two rungs.
 * Snapping up instead would keep the spacing even and flatten the growth that
 * makes the axis legible as logarithmic, so the floor that matters is the one
 * where labels would start to collide, not the target itself.
 */
test('logarithmic ticks never land close enough to collide', () => {
    const scale = scaleOver(LOGARITHMIC, 20, 400, 400);
    const ticks = scale.ticks();
    const gaps = ticks.slice(1).map((tick, index) => Math.abs(ticks[index].y - tick.y));
    const labelHeight = 18;

    assert.ok(gaps.length >= 3, `expected several gaps, got ${gaps.length}`);

    for (const gap of gaps) {
        assert.ok(gap > labelHeight, `ticks ${gap.toFixed(1)}px apart would overlap an ${labelHeight}px label`);
    }
});

test('a logarithmic axis survives a range that reaches zero', () => {
    const scale = scaleOver(LOGARITHMIC, 0, 100);

    assert.ok(Number.isFinite(scale.priceToY(0)));
    assert.ok(scale.ticks().every((tick) => Number.isFinite(tick.y)));
});

test('a narrow logarithmic range still produces a usable axis', () => {
    const scale = scaleOver(LOGARITHMIC, 23, 28, 400);

    assert.ok(scale.ticks().length >= 3, 'a decade ladder finds nothing between 23 and 28');
});

/**
 * Percentage mode once mapped the ratio but went on generating and labelling
 * prices, so the axis read 23.00 where it should have read 12.51%.
 */
/**
 * The base is deliberately not a round number and not the bottom of the range.
 * With a base of 100 over 80 to 120 this proves nothing: ticks anchored to the
 * range minimum land on round percentages of 100 as well, so a scale that had
 * forgotten the base entirely would pass.
 */
const AWKWARD_BASE = 97;

test('percentage ticks land on round percentages of the base', () => {
    const scale = scaleOver(PERCENTAGE, 80, 120);

    scale.percentageBase = AWKWARD_BASE;

    const percents = scale.ticks().map((tick) => (tick.price / AWKWARD_BASE - 1) * 100);

    assert.ok(percents.length >= 3, `expected several ticks, got ${percents.length}`);

    for (const percent of percents) {
        assert.ok(
            Math.abs(percent - Math.round(percent * 100) / 100) < 1e-6,
            `${percent}% is not a round move from the base`,
        );
    }

    const steps = percents.slice(1).map((percent, index) => percent - percents[index]);

    for (const step of steps) {
        assert.ok(Math.abs(step - steps[0]) < 1e-6, 'percentage steps are even');
    }
});

test('the percentage base sits at zero per cent', () => {
    const scale = scaleOver(PERCENTAGE, 80, 120);

    scale.percentageBase = AWKWARD_BASE;

    const zero = scale.ticks().find((tick) => Math.abs(tick.price - AWKWARD_BASE) < 1e-6);

    assert.ok(zero, 'the base price should be one of the ticks');
});
