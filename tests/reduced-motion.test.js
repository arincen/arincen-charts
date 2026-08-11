import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';
import { LastPriceAnimationMode } from '../src/options.js';
import { prefersReducedMotion } from '../src/motion.js';

/**
 * Movement nobody asked for.
 *
 * A chart has two things that move on their own: the ring pulsing on the last
 * price, and the glide that carries a flicked chart after the finger has gone.
 * Both are decoration over information already on screen, which is the category
 * `prefers-reduced-motion` exists for — for a reader with vestibular
 * sensitivity a pulse is not a nice touch, it is something moving at the edge
 * of their vision for as long as the tab is open.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

/** Pretends the reader has, or has not, asked for less movement. */
function withPreference(reduce, run) {
    const previous = globalThis.matchMedia;

    globalThis.matchMedia = (query) => ({
        matches: query.includes('reduced-motion') ? reduce : false,
        addEventListener() {},
        removeEventListener() {},
    });

    try {
        return run();
    } finally {
        if (previous) {
            globalThis.matchMedia = previous;
        } else {
            delete globalThis.matchMedia;
        }
    }
}

/** Counts the arcs the pulse draws. */
function arcsDrawn(chart) {
    let arcs = 0;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        arc: () => { arcs++; },
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return arcs;
}

function pulsing() {
    const chart = createChart(container(), { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries, {
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
    });

    series.setData(points(30));

    return chart;
}

/**
 * Runs against a chart and takes it down afterwards, failure or not.
 *
 * A pulsing chart asks for the next frame from inside the frame it is drawing,
 * so one left standing keeps the process alive for ever. Tear it down only on
 * the success path and a failing assertion doesn't report a failure — it hangs
 * the runner, which is how this was found.
 */
function using(chart, run) {
    try {
        return run(chart);
    } finally {
        chart.remove();
    }
}

test('the setting is read, not assumed', () => {
    assert.equal(withPreference(true, () => prefersReducedMotion()), true);
    assert.equal(withPreference(false, () => prefersReducedMotion()), false);
});

test('it is false where nothing can be asked', () => {
    const previous = globalThis.matchMedia;

    delete globalThis.matchMedia;

    try {
        // A server render or an old browser. Assuming the reader wants less
        // movement would quietly turn off a feature they asked for.
        assert.equal(prefersReducedMotion(), false);
    } finally {
        if (previous) {
            globalThis.matchMedia = previous;
        }
    }
});

test('the last price pulses when nobody has objected', () => {
    withPreference(false, () => using(pulsing(), (chart) => {
        assert.ok(arcsDrawn(chart) > 0, 'the pulse never drew');
    }));
});

test('and stops when they have', () => {
    withPreference(true, () => using(pulsing(), (chart) => {
        assert.equal(arcsDrawn(chart), 0, 'the pulse kept going against the reader’s setting');
    }));
});

test('the setting is re-read every frame', () => {
    using(withPreference(false, pulsing), (chart) => {
        withPreference(false, () => {
            assert.ok(arcsDrawn(chart) > 0, 'the pulse never drew to begin with');
        });

        // Turned on with the chart already up. Cached at construction, the
        // reader would have to reload the page to be listened to.
        withPreference(true, () => {
            assert.equal(arcsDrawn(chart), 0, 'the chart went on pulsing after the setting changed');
        });
    });
});

test('a flick does not glide on when movement is unwelcome', () => {
    withPreference(true, () => using(createChart(container(), { width: 600, height: 300 }), (chart) => {
        chart.addSeries(LineSeries, {}).setData(points(60));
        chart._internal.render();

        const internal = chart._internal;

        internal.pointer = { ...internal.pointer, mode: 'plot', touchSpeed: 40, moved: true };
        internal.handleTouchEnd({ touches: [], changedTouches: [] });

        assert.equal(internal.cancelKinetic ?? null, null, 'the chart glided on after the finger left');
    }));
});

test('and does glide when it is welcome', () => {
    withPreference(false, () => using(createChart(container(), { width: 600, height: 300 }), (chart) => {
        chart.addSeries(LineSeries, {}).setData(points(60));
        chart._internal.render();

        const internal = chart._internal;

        internal.pointer = { ...internal.pointer, mode: 'plot', touchSpeed: 40, moved: true };
        internal.handleTouchEnd({ touches: [], changedTouches: [] });

        // Otherwise the test above passes on a build where kinetic scrolling
        // is simply broken for everyone.
        assert.ok(internal.cancelKinetic, 'a flick did not carry the chart at all');
    }));
});
