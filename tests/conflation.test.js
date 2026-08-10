import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildConflationLevels,
    conflationStep,
    levelFor,
    mergeRun,
} from '../src/conflation.js';

/* --------------------------------------------------------------- the step */

test('nothing is merged while the bars can be told apart', () => {
    for (const barSpacing of [0.5, 1, 6, 24, 200]) {
        assert.equal(conflationStep(barSpacing), 1, `${barSpacing}px bars were merged`);
    }
});

test('the tighter the bars, the more are merged into one', () => {
    assert.equal(conflationStep(0.25), 2);
    assert.equal(conflationStep(0.1), 5);
    assert.equal(conflationStep(0.01), 50);
});

test('a smoothing factor merges further than the eye strictly requires', () => {
    assert.ok(conflationStep(0.25, 4) > conflationStep(0.25, 1), 'the factor did nothing');
    assert.equal(conflationStep(0.5, 8), 8);
});

test('a scale with no width yet merges nothing', () => {
    assert.equal(conflationStep(0), 1);
    assert.equal(conflationStep(-1), 1);
    assert.equal(conflationStep(NaN), 1);
});

/* -------------------------------------------------------------- the merge */

const bars = [
    { open: 10, high: 15, low: 8, close: 12, value: 12 },
    { open: 12, high: 30, low: 11, close: 20, value: 20 },
    { open: 20, high: 22, low: 2, close: 18, value: 18 },
    { open: 18, high: 19, low: 17, close: 19, value: 19 },
];

/**
 * The rule that keeps a conflated chart honest. An averaged candle is a candle
 * that was never traded, and an averaged high takes the day's extreme off the
 * chart — which is the one thing a reader zoomed out is looking for.
 */
test('a merged bar takes the first open and the last close', () => {
    const merged = mergeRun(bars, 0, 4, true);

    assert.equal(merged.open, 10, 'the open was not the first');
    assert.equal(merged.close, 19, 'the close was not the last');
});

test('a merged bar keeps the extremes rather than averaging them away', () => {
    const merged = mergeRun(bars, 0, 4, true);

    assert.equal(merged.high, 30, 'the highest high was lost');
    assert.equal(merged.low, 2, 'the lowest low was lost');
});

test('a spike survives being merged with quiet bars around it', () => {
    const quiet = Array.from({ length: 60 }, () => ({ open: 10, high: 10.1, low: 9.9, close: 10, value: 10 }));

    quiet[37] = { open: 10, high: 99, low: 1, close: 10, value: 10 };

    const merged = mergeRun(quiet, 0, 60, true);

    assert.equal(merged.high, 99, 'a spike vanished when the bars were merged');
    assert.equal(merged.low, 1);
});

test('a merged line takes a reading that happened, not an average', () => {
    const merged = mergeRun(bars, 0, 4, false);

    assert.equal(merged.value, 19, 'the line was moved to a number nobody quoted');
    assert.ok(bars.includes(merged), 'the merged point was invented rather than chosen');
});

test('whitespace inside a run is stepped over', () => {
    const holed = [bars[0], undefined, { value: null }, bars[3]];
    const merged = mergeRun(holed, 0, 4, true);

    assert.equal(merged.open, 10);
    assert.equal(merged.close, 19);
});

test('a run of nothing but whitespace merges to nothing', () => {
    assert.equal(mergeRun([undefined, undefined], 0, 2, true), null);
    assert.equal(mergeRun([{ value: null }], 0, 1, false), null);
});

/* ------------------------------------------------------------- the ladder */

const many = (count) => Array.from({ length: count }, (_, index) => ({
    value: index, open: index, high: index + 1, low: index - 1, close: index,
}));

test('the ladder doubles in coarseness and stops when there is nothing left to halve', () => {
    const levels = buildConflationLevels(many(1000), false);

    // Halving stops while a level would still hold at least 32 readings —
    // below that there is nothing left worth merging.
    assert.deepEqual(levels.map((level) => level.step), [2, 4, 8, 16]);
    assert.deepEqual(
        buildConflationLevels(many(4000), false).map((level) => level.step),
        [2, 4, 8, 16, 32, 64],
    );
});

test('a series too small to be worth merging gets no ladder at all', () => {
    assert.deepEqual(buildConflationLevels(many(20), false), []);
    assert.deepEqual(buildConflationLevels([], false), []);
});

/**
 * A level holds one entry per run, not one per original reading. The first
 * version allocated a full-length array per level, which on half a million
 * readings was thirteen arrays of half a million slots — eighty megabytes to
 * store what fits in one extra copy — and made the ladder grow with the number
 * of levels rather than shrink.
 */
test('a level is packed, not a mostly empty array of the original length', () => {
    const [first, second] = buildConflationLevels(many(1000), false);

    assert.equal(first.points.length, 500, 'the first level was not halved');
    assert.equal(second.points.length, 250, 'the second level was not halved again');
});

test('the whole ladder costs less than the data it summarises', () => {
    for (const count of [1000, 4000, 500_000]) {
        const levels = buildConflationLevels(many(count), true);
        const slots = levels.reduce((total, level) => total + level.points.length, 0);

        assert.ok(
            slots < count,
            `${count} readings produced a ladder of ${slots} slots across ${levels.length} levels`,
        );
    }
});

/**
 * Reading one back is `points[index / step]`, which is what lets a draw loop
 * stride over the original axis without a second coordinate system — and works
 * unchanged with no conflation at all, because a stride of one divides away.
 */
test('a reading is found at its index divided by the stride', () => {
    const points = many(1000);
    const [first] = buildConflationLevels(points, true);

    // Index 20 falls in run 10 at a stride of two, which covers 20 and 21.
    const run = first.points[20 / first.step];

    assert.equal(run.open, points[20].open, 'the run did not start where it should');
    assert.equal(run.close, points[21].close, 'the run did not end where it should');
});

/* -------------------------------------------------------- choosing a level */

const ladder = () => buildConflationLevels(many(2000), false);

test('the coarsest level that still shows everything is the one used', () => {
    assert.equal(levelFor(ladder(), 8).step, 8);
    assert.equal(levelFor(ladder(), 9).step, 8, 'it jumped past what was asked for');
    assert.equal(levelFor(ladder(), 1000).step, 32, 'it did not take the coarsest available');
});

test('a stride of one means the data as it stands', () => {
    assert.equal(levelFor(ladder(), 1), null);
});

/**
 * The property the whole feature rests on: merging changes how much is drawn
 * and never what the data says. A chart that quietly clipped its own extremes
 * when zoomed out would be worse than a slow one, because a reader zoomed out
 * is usually looking for exactly those extremes.
 */
test('the envelope survives every level of merging', () => {
    const count = 20_000;
    const points = new Array(count);
    let price = 100;
    let seed = 7;

    for (let i = 0; i < count; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;

        const noise = seed / 0x7fffffff - 0.5;
        const open = price;
        const close = open + noise * 0.8;

        points[i] = { open, close, high: Math.max(open, close) + 0.3, low: Math.min(open, close) - 0.3, value: close };
        price = close;
    }

    const truth = points.reduce(
        (range, point) => ({ high: Math.max(range.high, point.high), low: Math.min(range.low, point.low) }),
        { high: -Infinity, low: Infinity },
    );

    for (const level of buildConflationLevels(points, true)) {
        const seen = level.points.filter(Boolean).reduce(
            (range, point) => ({ high: Math.max(range.high, point.high), low: Math.min(range.low, point.low) }),
            { high: -Infinity, low: Infinity },
        );

        assert.equal(seen.high, truth.high, `stride ${level.step} clipped the highest high`);
        assert.equal(seen.low, truth.low, `stride ${level.step} clipped the lowest low`);
    }
});
