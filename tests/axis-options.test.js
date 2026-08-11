import './support/full-build.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { magnetPrice, moveInOrder, sourcePoint, spreadBadges } from '../src/chart.js';

/** The price alone: the helper reports the scale it came from as well. */
const snappedPrice = (...args) => magnetPrice(...args)?.price ?? null;
import { formatDatePattern } from '../src/time.js';
import { TimeScale, PriceScale } from '../src/scales.js';
import { CrosshairMode, PriceLineSource } from '../src/options.js';

/* ------------------------------------------------------------ alignLabels */

const at = (...ys) => ys.map((y) => ({ y }));
const ysOf = (badges) => badges.map((badge) => badge.y);

/**
 * Two labels at nearly the same price paint over each other, and the one
 * underneath becomes a fringe of pixels around the one on top — neither
 * readable, which is worse than either being a pixel out of place.
 */
test('badges that would overlap are pushed apart', () => {
    const spread = spreadBadges(at(100, 104, 108), 20, 0, 400);

    for (let index = 1; index < spread.length; index++) {
        assert.ok(
            spread[index].y - spread[index - 1].y >= 20,
            `badges still overlap: ${ysOf(spread).join(', ')}`,
        );
    }
});

test('badges that already fit are left where they were', () => {
    assert.deepEqual(ysOf(spreadBadges(at(50, 150, 250), 20, 0, 400)), [50, 150, 250]);
});

test('badges come back in order whatever order they arrived in', () => {
    assert.deepEqual(ysOf(spreadBadges(at(250, 50, 150), 20, 0, 400)), [50, 150, 250]);
});

/**
 * A pile of labels near the bottom edge would otherwise be pushed off it. The
 * second pass slides the whole run back up rather than letting the last few
 * fall out of the pane.
 */
test('a crowd at the bottom is pushed back up, not off the edge', () => {
    const spread = spreadBadges(at(390, 392, 394, 396), 20, 0, 400);

    for (const badge of spread) {
        assert.ok(badge.y <= 400, `a badge was pushed to ${badge.y}, past the pane`);
    }

    for (let index = 1; index < spread.length; index++) {
        assert.ok(spread[index].y - spread[index - 1].y >= 20, 'they were rescued but still overlap');
    }
});

test('nothing is ever dropped — a label asked for is a label owed', () => {
    for (const count of [1, 2, 9, 40]) {
        const badges = Array.from({ length: count }, (_, index) => ({ y: 200 + index }));

        assert.equal(spreadBadges(badges, 20, 0, 400).length, count);
    }
});

/* ------------------------------------------------------------ invertScale */

function priceScaleWith(invertScale) {
    const scale = new PriceScale({
        scaleMargins: { top: 0, bottom: 0 },
        mode: 0,
        invertScale,
    });

    scale.setRange(0, 100);
    scale.setViewport(0, 400);

    return scale;
}

/**
 * Inverting is done at the single point every coordinate passes through, so
 * series, price lines, the crosshair and a plugin's own drawing all turn over
 * together — and nothing else in the library needs to know the option exists.
 */
test('an inverted scale puts the high price at the bottom', () => {
    const upright = priceScaleWith(false);
    const inverted = priceScaleWith(true);

    assert.ok(upright.priceToY(100) < upright.priceToY(0), 'the upright scale is upside down');
    assert.ok(inverted.priceToY(100) > inverted.priceToY(0), 'inverting did nothing');
});

test('an inverted scale reads a price back from a pixel correctly', () => {
    const inverted = priceScaleWith(true);

    for (const price of [0, 25, 50, 99.5, 100]) {
        const back = inverted.yToPrice(inverted.priceToY(price));

        assert.ok(Math.abs(back - price) < 0.001, `${price} came back as ${back}`);
    }
});

/* ---------------------------------------------------------- maxBarSpacing */

test('bar spacing has a ceiling, and a caller may choose it', () => {
    const wide = new TimeScale({ minBarSpacing: 0.5, maxBarSpacing: 0, barSpacing: 6, rightOffset: 0 });
    const capped = new TimeScale({ minBarSpacing: 0.5, maxBarSpacing: 20, barSpacing: 6, rightOffset: 0 });

    assert.equal(wide.clampSpacing(10_000), 200, 'the default ceiling is gone');
    assert.equal(capped.clampSpacing(10_000), 20, 'the caller s ceiling was ignored');
    assert.equal(capped.clampSpacing(5), 5, 'a spacing under the ceiling was clamped anyway');
});

/* ------------------------------------------------------------- dateFormat */

const jan = Date.UTC(2024, 0, 9, 14, 5) / 1000;

test('a date pattern is filled with the vocabulary a caller already has', () => {
    assert.equal(formatDatePattern('yyyy-MM-dd', jan, 'en'), '2024-01-09');
    assert.equal(formatDatePattern('dd/MM/yy', jan, 'en'), '09/01/24');
    assert.equal(formatDatePattern('d MMM yyyy', jan, 'en'), '9 Jan 2024');
    assert.equal(formatDatePattern('HH:mm', jan, 'en'), '14:05');
});

/**
 * Longest tokens first, or `yyyy` is eaten twice by `yy` and a year comes out
 * as `2424`.
 */
test('a four digit year is not eaten by the two digit one', () => {
    assert.equal(formatDatePattern('yyyy', jan, 'en'), '2024');
    assert.equal(formatDatePattern('MMMM', jan, 'en'), 'January');
});

test('text around the tokens is left alone', () => {
    assert.equal(formatDatePattern('[yyyy]', jan, 'en'), '[2024]');
});

/* --------------------------------------------------------------- group K */

/**
 * Their crosshair snaps to the data of hidden series unless told not to. Ours
 * defaults the other way round, because a magnet pulling towards a reading
 * nobody can see is a magnet pulling towards nothing. The option exists so a
 * caller who wants their behaviour can ask for it.
 */
test('the magnet ignores hidden series, and can be told not to', () => {
    const pane = { priceScale: { priceToY: (price) => 500 - price }, series: [] };

    pane.series = [
        { options: { visible: true }, byIndex: [{ value: 100 }], scale: pane },
        { options: { visible: false }, byIndex: [{ value: 190 }], scale: pane },
    ];

    // The pointer sits right next to the hidden series' reading.
    const near = 500 - 189;

    assert.equal(snappedPrice(pane, 0, near, CrosshairMode.Magnet), 100, 'it snapped to a series nobody can see');
    assert.equal(snappedPrice(pane, 0, near, CrosshairMode.Magnet, false), 190, 'the option could not be turned off');
});

/**
 * Painting order is what `setSeriesOrder` moves, and a caller asking for the
 * top should not have to count the series first — so it clamps rather than
 * refusing.
 */
function reorder(names, subject, order) {
    const list = names.map((name) => ({ name }));

    return moveInOrder(list, list.find((candidate) => candidate.name === subject), order)
        .map((candidate) => candidate.name);
}

test('a series can be moved through the painting order', () => {
    assert.deepEqual(reorder(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
    assert.deepEqual(reorder(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
    assert.deepEqual(reorder(['a', 'b', 'c'], 'b', 1), ['a', 'b', 'c']);
});

/**
 * A long enough list that clamping and `splice`'s own behaviour part company:
 * `splice(-2)` counts from the end, so a caller passing a negative order would
 * land near the top instead of at the bottom. On three entries the two agree,
 * which is how this went untested the first time.
 */
test('an order past either end lands at that end rather than being refused', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];

    assert.deepEqual(reorder(six, 'a', 99), ['b', 'c', 'd', 'e', 'f', 'a']);
    assert.deepEqual(reorder(six, 'f', -2), ['f', 'a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(reorder(six, 'c', -100), ['c', 'a', 'b', 'd', 'e', 'f']);
});

/* --------------------------------------------------------- priceLineSource */

const withPoints = (source, count = 10) => ({
    options: { priceLineSource: source },
    byIndex: Array.from({ length: count }, (_, index) => ({ value: 100 + index })),
    lastPoint: () => ({ value: 100 + count - 1 }),
});

/**
 * Scrolled back through history, a price line pinned to the newest bar sits off
 * screen — and the badge it leaves on the axis still reads as the current
 * price while being nothing of the sort.
 */
test('the price line can follow the last visible bar instead of the last bar', () => {
    const pinned = withPoints(PriceLineSource.LastBar);
    const following = withPoints(PriceLineSource.LastVisible);

    // The viewport ends at index 4, five bars back from the end.
    assert.equal(sourcePoint(pinned, 4).value, 109, 'it stopped following the newest bar');
    assert.equal(following.byIndex[4].value, 104);
    assert.equal(sourcePoint(following, 4).value, 104, 'it ignored the viewport');
});

test('following the viewport skips back over whitespace', () => {
    const series = withPoints(PriceLineSource.LastVisible);

    series.byIndex[4] = undefined;
    series.byIndex[3] = { value: null };

    assert.equal(sourcePoint(series, 4).value, 102, 'it stopped on a gap instead of stepping past it');
});

test('a series entirely out of view has nothing to follow', () => {
    assert.equal(sourcePoint(withPoints(PriceLineSource.LastVisible), -1), null);
});
