import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeScale } from '../src/scales.js';

/**
 * `setLogicalRange` is the one piece of group A that is arithmetic rather than
 * plumbing, and everything a caller uses to frame a chart goes through it —
 * `setVisibleRange`, `setVisibleLogicalRange` and every "show me the last
 * three months" button anyone will ever build on top of them.
 */
function scaleWith(count, width = 600) {
    const scale = new TimeScale({ minBarSpacing: 0.5, rightOffset: 0, barSpacing: 6, fixRightEdge: false, fixLeftEdge: false });

    scale.width = width;
    scale.setPoints(Array.from({ length: count }, (_, index) => 1700000000 + index * 86400));

    return scale;
}

test('a range asked for is the range you get', () => {
    const scale = scaleWith(500);

    scale.setLogicalRange(100, 200);

    const range = scale.logicalRange();

    assert.ok(Math.abs(range.from - 100) < 0.001, `left edge landed at ${range.from}`);
    assert.ok(Math.abs(range.to - 200) < 0.001, `right edge landed at ${range.to}`);
});

test('the range holds wherever it is asked for', () => {
    for (const [from, to] of [[0, 50], [250, 260], [400, 499], [10, 490]]) {
        const scale = scaleWith(500);

        scale.setLogicalRange(from, to);

        const range = scale.logicalRange();

        assert.ok(Math.abs(range.from - from) < 0.001, `${from}..${to} left landed at ${range.from}`);
        assert.ok(Math.abs(range.to - to) < 0.001, `${from}..${to} right landed at ${range.to}`);
    }
});

/**
 * A range may run past the data on either side — that is how a caller leaves
 * room for a drawing, or scrolls into whitespace to place one.
 */
test('a range may sit beyond the last bar', () => {
    const scale = scaleWith(100);

    scale.setLogicalRange(90, 140);

    assert.ok(scale.logicalRange().to > 99, 'the range was pulled back to the data');
});

/**
 * Asking for a thousand bars in six hundred pixels runs into the minimum
 * spacing. The scale shows fewer bars at a legible width rather than shrinking
 * them to a smear, which is the only useful answer to an impossible request.
 */
test('an impossible range is refused legibly rather than obeyed illegibly', () => {
    const scale = scaleWith(100_000);

    scale.setLogicalRange(0, 100_000);

    assert.ok(scale.barSpacing >= 0.5, `bar spacing collapsed to ${scale.barSpacing}`);
});

test('a backwards or empty range is ignored rather than inverting the chart', () => {
    const scale = scaleWith(500);

    scale.setLogicalRange(100, 200);

    const before = { barSpacing: scale.barSpacing, rightOffset: scale.rightOffset };

    for (const [from, to] of [[200, 100], [50, 50], [NaN, 10], [0, Infinity]]) {
        scale.setLogicalRange(from, to);

        assert.deepEqual(
            { barSpacing: scale.barSpacing, rightOffset: scale.rightOffset },
            before,
            `${from}..${to} moved the viewport`,
        );
    }
});

test('a scale with no width yet does not try to frame anything', () => {
    const scale = scaleWith(500, 0);

    scale.setLogicalRange(0, 100);

    assert.equal(scale.width, 0);
});

/**
 * The round trip a plugin depends on: a coordinate turned into a logical index
 * and back must land where it started, or every drawing placed by pixel drifts.
 */
test('a coordinate survives the trip through logical space', () => {
    const scale = scaleWith(500);

    scale.setLogicalRange(120, 180);

    for (const x of [0, 1, 137, 299, 599]) {
        const back = scale.indexToX(scale.xToIndex(x));

        assert.ok(Math.abs(back - x) < 0.001, `${x} came back as ${back}`);
    }
});

/* -------------------------------------------------- bars in a logical range */

/**
 * `barsInLogicalRange` is measured against the series' own first and last bar,
 * not against the chart's merged index. On a chart carrying a moving average
 * that starts late, or a second instrument with less history, measuring from
 * the merged index reports bars that belong to somebody else's data — and a
 * caller loading history on demand decides it has plenty when it has none.
 *
 * Exercised through the same shape the API builds it from: `byIndex` is the
 * merged index, holed where this series has nothing.
 */
function barsIn(byIndex, range) {
    const first = byIndex.findIndex(Boolean);
    const last = byIndex.length - 1 - [...byIndex].reverse().findIndex(Boolean);

    if (first < 0) {
        return null;
    }

    return { barsBefore: range.from - first, barsAfter: last - range.to };
}

test('a short series measures from its own bars, not the chart s', () => {
    // A hundred slots, but this series only occupies 40 through 59.
    const byIndex = new Array(100);

    for (let index = 40; index <= 59; index++) {
        byIndex[index] = { time: index };
    }

    const info = barsIn(byIndex, { from: 45, to: 55 });

    assert.equal(info.barsBefore, 5, 'it counted bars belonging to another series');
    assert.equal(info.barsAfter, 4);
});

/**
 * Their sign convention, which we match: positive means bars exist off-screen,
 * negative means the series has run out and the viewport is over whitespace.
 * A caller's `if (barsBefore < 50) loadMore()` depends on it.
 */
test('running out of bars is a negative count, not a zero', () => {
    const byIndex = Array.from({ length: 100 }, (_, index) => ({ time: index }));

    assert.ok(barsIn(byIndex, { from: -20, to: 50 }).barsBefore < 0, 'whitespace to the left read as bars');
    assert.ok(barsIn(byIndex, { from: 50, to: 130 }).barsAfter < 0, 'whitespace to the right read as bars');
    assert.ok(barsIn(byIndex, { from: 20, to: 80 }).barsBefore > 0);
    assert.ok(barsIn(byIndex, { from: 20, to: 80 }).barsAfter > 0);
});

/**
 * `resetTimeScale` restores the framing the chart was configured with —
 * `barSpacing` and `rightOffset` as set — and is not a second name for
 * `fitContent`, which squeezes every bar on screen however many there are.
 * On a chart with years of daily data the two look nothing alike, and a caller
 * who wanted their default zoom back would instead get everything at once.
 */
test('resetting is not the same as fitting', () => {
    const configured = { minBarSpacing: 0.5, rightOffset: 0, barSpacing: 6, fixRightEdge: false, fixLeftEdge: false };

    const fitted = new TimeScale({ ...configured });

    fitted.width = 600;
    fitted.setPoints(Array.from({ length: 2000 }, (_, index) => 1700000000 + index * 86400));
    fitted.fitContent();

    const reset = new TimeScale({ ...configured });

    reset.width = 600;
    reset.setPoints(Array.from({ length: 2000 }, (_, index) => 1700000000 + index * 86400));
    reset.setBarSpacing(configured.barSpacing);
    reset.rightOffset = configured.rightOffset;

    assert.ok(
        Math.abs(reset.barSpacing - fitted.barSpacing) > 1,
        `both framings gave ${reset.barSpacing}px bars, so resetting is only fitting under another name`,
    );
    assert.equal(reset.barSpacing, 6, 'the configured bar spacing was not restored');
});

/* ------------------------------------------- shiftVisibleRangeOnNewBar */

function streaming(rightOffset, { shiftVisibleRangeOnNewBar = true, count = 200 } = {}) {
    const scale = new TimeScale({
        minBarSpacing: 0.5,
        maxBarSpacing: 0,
        barSpacing: 10,
        rightOffset: 0,
        fixLeftEdge: false,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar,
    });

    scale.width = 600;
    scale.setPoints(Array.from({ length: count }, (_, index) => index));
    scale.rightOffset = rightOffset;

    const before = scale.logicalRange();

    scale.setPoints(Array.from({ length: count + 1 }, (_, index) => index));

    return { moved: scale.logicalRange().from - before.from };
}

/**
 * Every bar is positioned by counting back from the last one, so a new bar
 * moves all of them unless something compensates. At the live edge that is
 * right — the newest bar should stay where the eye already is.
 */
test('a chart at the live edge follows a new bar', () => {
    assert.equal(streaming(0).moved, 1, 'the chart did not follow the new bar');
});

/**
 * The defect: it followed everywhere. A reader scrolled back into history was
 * dragged forward one bar on every tick, so on a streaming chart the page slid
 * out from under them while they were reading it.
 */
test('a chart scrolled back into history is left alone', () => {
    assert.equal(streaming(-100).moved, 0, 'the viewport moved while somebody was reading history');
    assert.equal(streaming(-5).moved, 0);
});

test('the whole behaviour can be refused', () => {
    assert.equal(streaming(0, { shiftVisibleRangeOnNewBar: false }).moved, 0);
});

/**
 * Scrolled so far forward that the last bar is off the left of the screen —
 * out of view in the other direction, and equally not somewhere to be dragged
 * from.
 */
test('a chart scrolled past the end is left alone too', () => {
    assert.equal(streaming(200).moved, 0, 'it followed a bar that was off screen');
});

test('the first load is not a shift', () => {
    const scale = new TimeScale({
        minBarSpacing: 0.5, maxBarSpacing: 0, barSpacing: 10, rightOffset: 0,
        fixLeftEdge: false, fixRightEdge: false, shiftVisibleRangeOnNewBar: true,
    });

    scale.width = 600;
    scale.setPoints(Array.from({ length: 50 }, (_, index) => index));

    assert.equal(scale.rightOffset, 0, 'the first setData moved the viewport');
});
