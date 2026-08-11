import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';

/**
 * Where the light build stands on movement: it has none to stand down from.
 *
 * Written after the documentation claimed the opposite twice — first that the
 * light build has no kinetic scrolling (right, but unchecked), then that it has
 * some if you ask for it (wrong, and it took a test to say so). The option is
 * accepted and ignored, which is the kind of thing prose gets wrong and a
 * reader only discovers on a phone.
 *
 * Separate file because the build flag is per-process: importing
 * `support/full-build` anywhere above this would test the build it excludes.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

/** Flicks a light-build chart that was explicitly given kinetic scrolling. */
function flicked() {
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        kineticScroll: { touch: true, mouse: false },
    });

    chart.addSeries(LineSeries, {}).setData(points(60));
    chart._internal.render();

    const internal = chart._internal;

    internal.pointer = { ...internal.pointer, mode: 'plot', touchSpeed: 40, moved: true };
    internal.handleTouchEnd({ touches: [], changedTouches: [] });

    return { chart, glided: Boolean(internal.cancelKinetic) };
}

test('the light build does not default kinetic scrolling on', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    assert.equal(chart.options().kineticScroll, undefined);

    chart.remove();
});

test('the option is kept rather than rejected', () => {
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        kineticScroll: { touch: true, mouse: false },
    });

    // Shared code passing one options object to both builds should not throw
    // or lose the setting — the full build reads it, this one does not.
    assert.deepEqual(chart.options().kineticScroll, { touch: true, mouse: false });

    chart.remove();
});

test('and a flick still does not carry the chart', () => {
    const { chart, glided } = flicked();

    assert.equal(glided, false, 'the light build grew a kinetic scroll');

    chart.remove();
});

test('the pulse is not drawn either', () => {
    const chart = createChart(container(), { width: 600, height: 300 });
    let arcs = 0;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        arc: () => { arcs++; },
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    });

    chart.addSeries(LineSeries, { lastPriceAnimation: 1, lastValueColor: '#db2777' })
        .setData(points(30));

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    assert.equal(arcs, 0, 'a light chart pulsed its last price');

    chart.remove();
});
