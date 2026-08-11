import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';

/**
 * Failures in code the chart does not own.
 *
 * A chart draws from objects somebody else wrote — primitives, custom series,
 * autoscale providers — and one of them throwing must not take the chart down.
 * That bargain is right and stays. What was wrong is that it was kept in
 * silence: the failure was caught, dropped, and never mentioned, so a plugin
 * author whose `draw` threw on the first frame saw a chart with their plugin
 * missing, no error in the console, and nothing to search for.
 *
 * Deliberately the light build. Primitives and custom series both ship here,
 * so this is a build where other people's code runs.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

/** A chart that reports into an array instead of the console. */
function reporting(options = {}) {
    const seen = [];
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        onError: (error, source) => seen.push({ error, source }),
        ...options,
    });

    const series = chart.addSeries(LineSeries, {});

    series.setData(points(40));

    return { chart, series, seen };
}

/** Draws with a context that records nothing, so only the throwing matters. */
function render(chart) {
    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();
}

const throwing = (method, message = 'boom') => ({
    [method]: () => { throw new Error(message); },
});

/* --------------------------------------------------------------- the report */

test('a primitive that throws while drawing is reported', () => {
    const { chart, series, seen } = reporting();

    series.attachPrimitive({
        paneViews: () => [{ renderer: () => ({ draw: () => { throw new Error('bad renderer'); } }) }],
    });

    render(chart);

    assert.equal(seen.length, 1, `expected one report, got ${seen.length}`);
    assert.equal(seen[0].source, 'primitive.draw');
    assert.equal(seen[0].error.message, 'bad renderer');

    chart.remove();
});

test('and the chart carries on drawing without it', () => {
    const { chart, series } = reporting();

    series.attachPrimitive(throwing('paneViews'));

    // The bargain that is not changing: a broken plugin costs its own drawing
    // and nothing else. Reporting is notification, never control flow.
    render(chart);

    assert.equal(chart._internal.allSeries.length, 1);

    chart.remove();
});

test('each place that can throw names itself', () => {
    const cases = [
        ['paneViews', 'primitive.paneViews'],
        ['updateAllViews', 'primitive.updateAllViews'],
        ['priceAxisViews', 'primitive.priceAxisViews'],
        ['timeAxisViews', 'primitive.timeAxisViews'],
        ['autoscaleInfo', 'primitive.autoscaleInfo'],
    ];

    for (const [method, source] of cases) {
        const { chart, series, seen } = reporting();

        series.attachPrimitive(throwing(method));
        chart.timeScale().fitContent();
        render(chart);

        // Without the source, a report says only that something somewhere
        // threw — which is the position the author was already in.
        assert.ok(
            seen.some((entry) => entry.source === source),
            `${method} was reported as ${seen.map((entry) => entry.source).join(', ') || 'nothing'}`,
        );

        chart.remove();
    }
});

test('attaching and detaching are reported too', () => {
    const { chart, series, seen } = reporting();
    const primitive = {
        attached: () => { throw new Error('no'); },
        detached: () => { throw new Error('nor this'); },
    };

    series.attachPrimitive(primitive);
    series.detachPrimitive(primitive);

    assert.deepEqual(
        seen.map((entry) => entry.source),
        ['primitive.attached', 'primitive.detached'],
    );

    chart.remove();
});

/* ------------------------------------------------------------ the deduping */

test('the same failure every frame is reported once', () => {
    const { chart, series, seen } = reporting();

    series.attachPrimitive({
        paneViews: () => [{ renderer: () => ({ draw: () => { throw new Error('every frame'); } }) }],
    });

    for (let frame = 0; frame < 30; frame++) {
        render(chart);
    }

    // A chart left open reports sixty times a second otherwise — to the
    // console, or to whatever error service is listening and billing.
    assert.equal(seen.length, 1, `one broken primitive reported ${seen.length} times`);

    chart.remove();
});

test('a different failure from the same place is still reported', () => {
    const { chart, series, seen } = reporting();

    let message = 'first';

    series.attachPrimitive({
        paneViews: () => { throw new Error(message); },
    });

    render(chart);
    message = 'second';
    render(chart);

    // Deduping on the source alone would hide every later fault behind the
    // first one, which is how one fixed bug masks the next.
    assert.deepEqual(seen.map((entry) => entry.error.message), ['first', 'second']);

    chart.remove();
});

test('two charts do not share what they have already said', () => {
    const first = reporting();
    const second = reporting();

    for (const { series } of [first, second]) {
        series.attachPrimitive(throwing('paneViews', 'same message'));
    }

    render(first.chart);
    render(second.chart);

    assert.equal(first.seen.length, 1);
    assert.equal(second.seen.length, 1, 'the second chart was silenced by the first');

    first.chart.remove();
    second.chart.remove();
});

/* -------------------------------------------------------------- the handler */

test('with no handler it goes to the console', () => {
    const original = globalThis.console.error;
    const logged = [];

    globalThis.console.error = (...args) => logged.push(args);

    try {
        const chart = createChart(container(), { width: 600, height: 300 });

        chart.addSeries(LineSeries, {}).setData(points(40));
        chart._internal.allSeries[0].api.attachPrimitive(throwing('paneViews'));
        render(chart);

        // Silence was the defect. A caller who has never heard of onError is
        // the one most in need of being told.
        assert.equal(logged.length, 1, 'nothing was logged');
        assert.match(String(logged[0][0]), /arincen-charts/);
        assert.match(String(logged[0][0]), /primitive\.paneViews/);

        chart.remove();
    } finally {
        globalThis.console.error = original;
    }
});

test('a handler replaces the console rather than adding to it', () => {
    const original = globalThis.console.error;
    const logged = [];

    globalThis.console.error = (...args) => logged.push(args);

    try {
        const { chart, series } = reporting();

        series.attachPrimitive(throwing('paneViews'));
        render(chart);

        assert.equal(logged.length, 0, 'the handler was called and the console was written to as well');

        chart.remove();
    } finally {
        globalThis.console.error = original;
    }
});

test('a handler that throws does not take the render down with it', () => {
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        onError: () => { throw new Error('the handler is broken too'); },
    });

    const series = chart.addSeries(LineSeries, {});

    series.setData(points(40));
    series.attachPrimitive(throwing('paneViews'));

    // The one place a failure really cannot be allowed to cascade: this is
    // already the error path.
    render(chart);

    chart.remove();
});

test('the handler can be set after the chart is built', () => {
    const seen = [];
    const chart = createChart(container(), { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries, {});

    series.setData(points(40));
    chart.applyOptions({ onError: (error, source) => seen.push(source) });
    series.attachPrimitive(throwing('paneViews'));
    render(chart);

    assert.deepEqual(seen, ['primitive.paneViews']);

    chart.remove();
});

test('what is thrown need not be an Error', () => {
    const { chart, series, seen } = reporting();

    series.attachPrimitive({
        paneViews: () => { throw 'a bare string'; },  // eslint-disable-line no-throw-literal
    });

    render(chart);

    // Handed on as thrown rather than wrapped: a handler forwarding to an
    // error service wants what actually happened.
    assert.equal(seen[0]?.error, 'a bare string');

    chart.remove();
});
