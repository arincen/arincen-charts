import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';
import { register, unregister } from '../src/registry.js';

/**
 * Finding the charts on a page you did not write.
 *
 * The rest of the agent surface assumes a caller holding the chart object,
 * which assumes a page written to cooperate. This is the case where nobody
 * cooperated: an extension, a browser agent, a test harness. Without it their
 * only route to a canvas chart is reading pixels.
 */

const data = [
    { time: '2026-01-01', value: 100 },
    { time: '2026-01-02', value: 110 },
];

const build = () => {
    const chart = createChart(container(), { width: 300, height: 200 });

    chart.addSeries(LineSeries, {}).setData(data);

    return chart;
};

test('a chart puts itself where it can be found', () => {
    window.arincenCharts = [];

    const chart = build();

    assert.equal(window.arincenCharts.length, 1);
    assert.equal(window.arincenCharts[0], chart);

    // And it is the real thing, not a handle that has to be looked up.
    assert.match(window.arincenCharts[0].toText(), /A chart of 1 series/);

    chart.remove();
});

test('they arrive in the order the page built them', () => {
    window.arincenCharts = [];

    const first = build();
    const second = build();

    assert.deepEqual(window.arincenCharts, [first, second]);

    first.remove();
    second.remove();
});

test('a removed chart stops being findable', () => {
    window.arincenCharts = [];

    const first = build();
    const second = build();

    first.remove();

    // The one that went, and only the one that went. A registry that leaks is
    // worse than none: an agent calling `toText` on a destroyed chart gets an
    // exception it cannot interpret.
    assert.deepEqual(window.arincenCharts, [second]);

    second.remove();

    assert.deepEqual(window.arincenCharts, []);
});

/**
 * The module is imported wherever the library is, including a server-side
 * render — where a chart is never constructed, because `Chart` itself reads
 * `window.devicePixelRatio` on the way up, but the module is still evaluated
 * and its functions can still be reached. An unguarded global would throw
 * during the render rather than on the page, which is the hardest kind of
 * failure to place.
 */
test('registering without a window is a no-op rather than a crash', () => {
    const saved = globalThis.window;

    delete globalThis.window;

    try {
        const pretend = { toText: () => '' };

        assert.doesNotThrow(() => register(pretend));
        assert.doesNotThrow(() => unregister(pretend));
    } finally {
        globalThis.window = saved;
    }
});
