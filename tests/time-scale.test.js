import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeScale } from '../src/scales.js';

const DAY = 86400;

function timeScale(count = 100, overrides = {}) {
    const scale = new TimeScale({
        barSpacing: 6,
        rightOffset: 0,
        minBarSpacing: 0.5,
        fixLeftEdge: false,
        fixRightEdge: false,
        ...overrides,
    });

    scale.setPoints(Array.from({ length: count }, (_, index) => 1700000000 + index * DAY));
    scale.width = 600;

    return scale;
}

test('an index maps to a coordinate and back', () => {
    const scale = timeScale();

    for (const index of [0, 25, 60, 99]) {
        assert.ok(Math.abs(scale.xToIndex(scale.indexToX(index)) - index) < 1e-9);
    }
});

test('fitContent puts the first bar at the left edge and the last at the right', () => {
    const scale = timeScale();

    scale.fitContent();

    assert.ok(Math.abs(scale.indexToX(0)) < 1e-9);
    assert.ok(Math.abs(scale.indexToX(99) - scale.width) < 1e-9);
});

test('fitContent leaves half a bar of air for bar-like series', () => {
    const scale = timeScale();

    scale.padBars = 0.5;
    scale.fitContent();

    assert.ok(scale.indexToX(0) > 0, 'the first candle would be sliced in half at x=0');
    assert.ok(scale.indexToX(99) < scale.width, 'the last candle would be sliced by the axis');
});

test('a single point still produces a finite layout', () => {
    const scale = timeScale(1);

    scale.fitContent();

    assert.ok(Number.isFinite(scale.indexToX(0)));
    assert.ok(scale.barSpacing > 0);
});

/**
 * Content follows the cursor: dragging to the right walks back in time. The
 * sign here was inverted once and only measurement against lightweight-charts
 * caught it, because the chart still moved — just the wrong way.
 */
test('dragging right shows earlier bars', () => {
    const scale = timeScale();

    scale.fitContent();

    const before = scale.xToIndex(0);

    scale.scrollBy(60);

    assert.ok(scale.xToIndex(0) < before, 'dragging right should reveal older data');
});

test('dragging left shows later bars', () => {
    const scale = timeScale();

    scale.fitContent();

    const before = scale.xToIndex(0);

    scale.scrollBy(-60);

    assert.ok(scale.xToIndex(0) > before);
});

test('zooming holds the bar under the cursor still', () => {
    const scale = timeScale();

    scale.fitContent();

    const focalX = 200;
    const before = scale.xToIndex(focalX);

    scale.zoomAt(focalX, 1.4);

    assert.ok(Math.abs(scale.xToIndex(focalX) - before) < 1e-6, 'the focal bar drifted while zooming');
});

test('bar spacing is clamped to the configured minimum', () => {
    const scale = timeScale(100, { minBarSpacing: 2 });

    scale.setBarSpacing(0.01);

    assert.equal(scale.barSpacing, 2);
});

/**
 * The visible logical range is deliberately unclamped: clamping it to the data
 * made zooming out look like nothing had happened, because the reported range
 * stopped growing at the first and last bar.
 */
test('the logical range runs past the data once zoomed out', () => {
    const scale = timeScale();

    scale.fitContent();
    scale.zoomAt(300, 0.5);

    const range = scale.logicalRange();

    assert.ok(range.from < 0 || range.to > 99, 'zooming out should report whitespace beyond the data');
});

test('visible indices stay inside the data even when the range does not', () => {
    const scale = timeScale();

    scale.fitContent();
    scale.zoomAt(300, 0.4);

    const { from, to } = scale.visibleIndices();

    assert.ok(from >= 0 && to <= 99);
});

test('an empty series reports an empty visible range', () => {
    const scale = timeScale(0);

    assert.deepEqual(scale.visibleIndices(), { from: 0, to: -1 });
});

test('fixRightEdge keeps whitespace off the right', () => {
    const scale = timeScale(100, { fixRightEdge: true });

    scale.fitContent();
    scale.scrollBy(-400);

    assert.ok(scale.rightOffset <= scale.padBars + 1e-9, `rightOffset ran to ${scale.rightOffset}`);
});

test('fixLeftEdge keeps whitespace off the left', () => {
    const scale = timeScale(100, { fixLeftEdge: true });

    scale.fitContent();
    scale.scrollBy(400);

    assert.ok(scale.xToIndex(0) >= -1e-6, `the left edge exposed index ${scale.xToIndex(0)}`);
});
