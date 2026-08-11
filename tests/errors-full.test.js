import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/full.js';

/**
 * The reporting paths that only exist in the full build.
 *
 * `autoscaleInfoProvider` and custom series are both full-build features, so
 * the light suite in `errors.test.js` cannot reach them — it passed on a build
 * where the provider is never called at all, which is worth knowing about any
 * test that looks like it covers something.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

function reporting() {
    const seen = [];
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        onError: (error, source) => seen.push({ error, source }),
    });

    return { chart, seen };
}

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

test('a throwing autoscale provider is reported', () => {
    const { chart, seen } = reporting();

    chart.addSeries(LineSeries, {
        autoscaleInfoProvider: () => { throw new Error('bad provider'); },
    }).setData(points(40));

    chart.timeScale().fitContent();
    render(chart);

    assert.ok(
        seen.some((entry) => entry.source === 'series.autoscaleInfoProvider'),
        `reported ${seen.map((entry) => entry.source).join(', ') || 'nothing'}`,
    );

    chart.remove();
});

test('and the scale still has a usable range', () => {
    const { chart } = reporting();

    chart.addSeries(LineSeries, {
        autoscaleInfoProvider: () => { throw new Error('bad provider'); },
    }).setData(points(40));

    chart.timeScale().fitContent();
    render(chart);

    // Falling back to the range the chart worked out for itself, rather than
    // to nothing: a broken provider should cost its adjustment, not the axis.
    const y = chart._internal.panes[0].priceScale.priceToY(120);

    assert.ok(Number.isFinite(y), `the price scale returned ${y}`);

    chart.remove();
});

test('a custom series that throws while drawing is reported', () => {
    const { chart, seen } = reporting();

    chart.addCustomSeries({
        priceValueBuilder: (bar) => [bar.value],
        isWhitespace: (bar) => bar.value === undefined,
        renderer: () => ({ draw: () => { throw new Error('bad custom draw'); } }),
        update: () => {},
    }, {}).setData(points(40));

    render(chart);

    assert.ok(
        seen.some((entry) => entry.source === 'customSeries.draw'),
        `reported ${seen.map((entry) => entry.source).join(', ') || 'nothing'}`,
    );

    chart.remove();
});

test('a custom series that throws while being cleaned up is reported', () => {
    const { chart, seen } = reporting();

    const series = chart.addCustomSeries({
        priceValueBuilder: (bar) => [bar.value],
        isWhitespace: (bar) => bar.value === undefined,
        renderer: () => ({ draw: () => {} }),
        update: () => {},
        destroy: () => { throw new Error('bad destroy'); },
    }, {});

    series.setData(points(40));
    chart.removeSeries(series);

    // The series is gone either way — this reports why its own clean-up did
    // not finish, which otherwise looks like a leak with no cause.
    assert.ok(
        seen.some((entry) => entry.source === 'customSeries.destroy'),
        `reported ${seen.map((entry) => entry.source).join(', ') || 'nothing'}`,
    );
    assert.equal(chart._internal.allSeries.length, 0);

    chart.remove();
});

test('removing the whole chart reports what its series could not clean up', () => {
    const { chart, seen } = reporting();

    chart.addCustomSeries({
        priceValueBuilder: (bar) => [bar.value],
        isWhitespace: (bar) => bar.value === undefined,
        renderer: () => ({ draw: () => {} }),
        update: () => {},
        destroy: () => { throw new Error('bad destroy on teardown'); },
    }, {}).setData(points(40));

    chart.remove();

    assert.ok(seen.some((entry) => entry.source === 'customSeries.destroy'));
});
