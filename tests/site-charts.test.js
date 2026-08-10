import './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createChart,
    createSeriesMarkers,
    CandlestickSeries,
    AreaSeries,
    LineSeries,
} from '../src/index.js';

/**
 * The chart configurations arincen.com actually builds, drawn.
 *
 * Deliberately imported from the *light* entry with no full-build flag, which
 * is what the site loads — everything else in this suite runs with the flag
 * on, so a break confined to the light build would pass all of it.
 *
 * These mirror `LightweightChart.vue`, `InstrumentChart.vue` and
 * `Blocks/LineChart.vue` rather than testing them: a copy of a configuration
 * can drift from the component it was copied from. It still answers the
 * question a deploy asks — does the engine draw what this site asks it to —
 * which nothing else here does.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const container = () => document.createElement('div');

function renderCounting(chart) {
    let drawn = 0;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
    }, {
        get: (target, key) => {
            if (key in target) {
                return target[key];
            }

            // Counts any mark on the canvas, not only rectangles: a line
            // series never calls fillRect, so a rectangle counter reports a
            // perfectly good line chart as having drawn nothing.
            return ['fillRect', 'strokeRect', 'stroke', 'fill', 'fillText'].includes(key)
                ? () => { drawn++; }
                : () => {};
        },
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return drawn;
}

const candles = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    open: 100 + index * 0.1,
    high: 101 + index * 0.1,
    low: 99 + index * 0.1,
    close: 100.5 + index * 0.1,
}));

/** The instrument page: transparent background, no grid, no horizontal crosshair. */
const instrumentOptions = (dark = false) => ({
    width: 900,
    height: 400,
    layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: dark ? '#ffffff' : '#000000',
        attributionLogo: false,
    },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    crosshair: { horzLine: { visible: false } },
});

test('the instrument page chart draws', () => {
    const chart = createChart(container(), instrumentOptions());
    const series = chart.addSeries(CandlestickSeries, {});

    series.setData(candles(200));
    chart.timeScale().fitContent();

    assert.ok(renderCounting(chart) > 100, 'the instrument chart drew almost nothing');
});

test('the instrument page chart draws in dark mode too', () => {
    const chart = createChart(container(), instrumentOptions(true));

    chart.addSeries(CandlestickSeries, {}).setData(candles(200));

    assert.ok(renderCounting(chart) > 100);
});

/**
 * Price alerts are drawn as price lines on the instrument chart, and their
 * badges are the only thing on that surface using the axis-label path.
 */
test('the instrument chart draws with price alerts on it', () => {
    const chart = createChart(container(), instrumentOptions());
    const series = chart.addSeries(CandlestickSeries, {});

    series.setData(candles(200));

    for (const price of [100, 110, 110.4]) {
        series.createPriceLine({ price, color: '#ef5350', axisLabelVisible: true, title: 'alert' });
    }

    assert.ok(renderCounting(chart) > 100, 'the chart stopped drawing once alerts were added');
});

test('the instrument chart draws with markers on it', () => {
    const chart = createChart(container(), instrumentOptions());
    const series = chart.addSeries(CandlestickSeries, {});

    series.setData(candles(200));
    createSeriesMarkers(series, [
        { time: start + 10 * day, position: 'aboveBar', shape: 'arrowDown', color: '#ef5350', text: 'sell' },
        { time: start + 40 * day, position: 'belowBar', shape: 'arrowUp', color: '#26a69a', text: 'buy' },
    ]);

    assert.ok(renderCounting(chart) > 100);
});

/** The blog and CMS blocks: an area or line with the grid nearly off. */
test('the content block line chart draws', () => {
    const chart = createChart(container(), {
        width: 600,
        height: 200,
        layout: { background: { type: 'solid', color: 'transparent' }, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(0,0,0,0.05)' } },
    });

    chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 })
        .setData(candles(60).map((bar) => ({ time: bar.time, value: bar.close })));

    assert.ok(renderCounting(chart) > 10, 'the content block chart drew nothing');
});

test('an area chart draws, as the widgets use', () => {
    const chart = createChart(container(), { width: 600, height: 200 });

    chart.addSeries(AreaSeries, {})
        .setData(candles(60).map((bar) => ({ time: bar.time, value: bar.close })));

    assert.ok(renderCounting(chart) > 10);
});

/**
 * The site replaces a chart's data when the timeframe changes rather than
 * building a new chart, so a second `setData` on a live chart is the common
 * path and not an edge case.
 */
test('a chart survives its data being replaced, as a timeframe change does', () => {
    const chart = createChart(container(), instrumentOptions());
    const series = chart.addSeries(CandlestickSeries, {});

    series.setData(candles(200));
    renderCounting(chart);

    series.setData(candles(50));
    chart.timeScale().fitContent();

    assert.ok(renderCounting(chart) > 20, 'the chart stopped drawing after its data changed');
});

test('a chart survives a live price arriving', () => {
    const chart = createChart(container(), instrumentOptions());
    const series = chart.addSeries(CandlestickSeries, {});

    series.setData(candles(200));
    renderCounting(chart);

    series.update({ time: start + 199 * day, open: 120, high: 121, low: 119, close: 120.5 });
    series.update({ time: start + 200 * day, open: 120.5, high: 122, low: 120, close: 121 });

    assert.ok(renderCounting(chart) > 100, 'the chart stopped drawing after a tick');
});

test('a chart can be removed without throwing', () => {
    const chart = createChart(container(), instrumentOptions());

    chart.addSeries(CandlestickSeries, {}).setData(candles(50));
    renderCounting(chart);
    chart.remove();
});

/**
 * A long press on the chart is ours — it is how a reader without a mouse gets
 * a crosshair. The browser thinks a long press means "select this, and offer
 * to copy or search it", and on a phone it puts its own bubble over the chart
 * while the crosshair is being placed underneath. Shipped that way and caught
 * in production on the first try.
 *
 * Both refusals are needed: `user-select` stops the selection, and the WebKit
 * callout is a separate thing on iOS.
 */
test('the chart refuses the browser own long-press gesture', () => {
    const chart = createChart(container(), instrumentOptions());
    const style = chart.chartElement().style.cssText;

    for (const rule of ['user-select:none', '-webkit-user-select:none', '-webkit-touch-callout:none']) {
        assert.ok(style.includes(rule), `the chart element is missing ${rule}: ${style}`);
    }
});

test('the chart is still positioned and clipped as it was', () => {
    const chart = createChart(container(), instrumentOptions());
    const style = chart.chartElement().style.cssText;

    assert.ok(style.includes('position:relative'));
    assert.ok(style.includes('overflow:hidden'));
});
