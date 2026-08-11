import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOptions, chartDefaults } from '../src/options.js';
import { wheelZoomStep } from '../src/chart.js';

test('nested objects merge instead of replacing wholesale', () => {
    const target = chartDefaults();

    mergeOptions(target, { layout: { textColor: '#fff' } });

    assert.equal(target.layout.textColor, '#fff');
    assert.ok(target.layout.background, 'the rest of layout was thrown away');
    assert.equal(target.layout.fontSize, 12);
});

/**
 * `handleScroll: false` is the shorthand the widgets pass, and it has to reach
 * every sub-flag or a chart advertised as static still pans.
 */
test('a boolean expands to every flag beneath it', () => {
    const target = chartDefaults();

    mergeOptions(target, { handleScroll: false });

    assert.equal(target.handleScroll.mouseWheel, false);
    assert.equal(target.handleScroll.pressedMouseMove, false);
    assert.equal(target.handleScroll.horzTouchDrag, false);
    assert.equal(target.handleScroll.vertTouchDrag, false);
});

test('a boolean leaves non-boolean neighbours alone', () => {
    const target = { crosshair: { mode: 1, vertLine: { visible: true } } };

    mergeOptions(target, { crosshair: false });

    assert.equal(target.crosshair.mode, 1, 'mode is not a flag and should survive');
});

test('the source is copied, not shared', () => {
    const source = { layout: { textColor: '#fff' } };
    const target = mergeOptions({}, source);

    source.layout.textColor = '#000';

    assert.equal(target.layout.textColor, '#fff', 'the caller can still mutate our options');
});

test('a missing source leaves the target as it was', () => {
    const target = chartDefaults();

    assert.equal(mergeOptions(target, undefined), target);
    assert.equal(mergeOptions(target, null), target);
    assert.equal(target.layout.fontSize, 12);
});

/**
 * A wheel notch and a trackpad flick differ by an order of magnitude in delta.
 * A flat step per event raced away on a trackpad, which fires dozens of small
 * events per gesture — the zoom ran roughly six times too fast.
 */
test('a wheel notch and a trackpad flick both stay within one step', () => {
    for (const event of [
        { deltaY: -100, deltaMode: 0 },
        { deltaY: -3, deltaMode: 1 },
        { deltaY: -1, deltaMode: 2 },
        { deltaY: -4, deltaMode: 0 },
        { deltaY: -1000, deltaMode: 0 },
    ]) {
        const step = wheelZoomStep(event);

        assert.ok(Math.abs(step) <= 1, `delta ${event.deltaY} in mode ${event.deltaMode} gave ${step}`);
    }
});

/**
 * The unit a browser reports a wheel in is the browser's choice, not the
 * user's: Chrome sends pixels, Firefox sends lines, and a page-scrolling
 * device sends pages. One physical detent of the same wheel must zoom the same
 * amount in all three, or the chart is faster in one browser than another.
 */
test('one turn of the wheel is one step, whichever unit the browser reports', () => {
    const detents = [
        { deltaY: -100, deltaMode: 0 },
        { deltaY: -3, deltaMode: 1 },
        { deltaY: -1, deltaMode: 2 },
    ];

    for (const event of detents) {
        assert.equal(wheelZoomStep(event), 1, `mode ${event.deltaMode} did not give a whole step`);
    }
});

test('a small trackpad delta produces a proportionally small step', () => {
    const flick = Math.abs(wheelZoomStep({ deltaY: -4, deltaMode: 0 }));
    const notch = Math.abs(wheelZoomStep({ deltaY: -100, deltaMode: 0 }));

    assert.ok(flick < notch, 'a light flick should not zoom as far as a full notch');
    assert.ok(flick > 0, 'a light flick should still do something');
});

test('scroll direction is preserved', () => {
    assert.ok(wheelZoomStep({ deltaY: -100, deltaMode: 0 }) > 0);
    assert.ok(wheelZoomStep({ deltaY: 100, deltaMode: 0 }) < 0);

    // Compared with `===` rather than asserted equal to 0: a zero delta comes
    // back as negative zero, which the chart treats as no movement and strict
    // equality accepts, but which Object.is — and so assert.equal — does not.
    assert.ok(wheelZoomStep({ deltaY: 0, deltaMode: 0 }) === 0);
});

/* ---------------------------------------------------------------- autoSize */

/**
 * `autoSize` could be switched on and never off.
 *
 * Only the starting half was wired, so the observer went on resizing the chart
 * back to its container: a later `width`/`height` applied, then came undone on
 * the next frame. Found by writing a documentation demo that wanted a chart
 * smaller than the box it sits in, which read as `applyOptions` ignoring a
 * size rather than as an option that only travels one way.
 */
/**
 * The headless DOM has no `ResizeObserver`, and `startAutoSize` quietly does
 * nothing without one — so a test written without this stub asserts against a
 * chart that was never auto-sizing in the first place.
 */
function withResizeObserver(run) {
    const previous = globalThis.ResizeObserver;

    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };

    try {
        return run();
    } finally {
        if (previous) {
            globalThis.ResizeObserver = previous;
        } else {
            delete globalThis.ResizeObserver;
        }
    }
}

test('autoSize can be turned off again', async () => {
    const { container } = await import('./support/headless-dom.js');
    const { createChart } = await import('../src/index.js');

    const chart = withResizeObserver(
        () => createChart(container(), { autoSize: true, width: 600, height: 300 }),
    );

    assert.ok(chart._internal.resizeObserver, 'auto-sizing never started');

    chart.applyOptions({ autoSize: false });

    assert.equal(chart._internal.resizeObserver, null, 'the chart is still watching its container');

    chart.remove();
});

test('and a size set afterwards is the size it keeps', async () => {
    const { container } = await import('./support/headless-dom.js');
    const { createChart } = await import('../src/index.js');

    const chart = createChart(container(), { autoSize: true, width: 600, height: 400 });

    chart.applyOptions({ autoSize: false, width: 600, height: 240 });

    assert.equal(chart._internal.height, 240);

    chart.remove();
});

test('turning it back on resumes watching', async () => {
    const { container } = await import('./support/headless-dom.js');
    const { createChart } = await import('../src/index.js');

    const chart = withResizeObserver(
        () => createChart(container(), { autoSize: true, width: 600, height: 300 }),
    );

    chart.applyOptions({ autoSize: false });
    withResizeObserver(() => chart.applyOptions({ autoSize: true }));

    assert.ok(chart._internal.resizeObserver, 'it could be turned off but not back on');

    chart.remove();
});
