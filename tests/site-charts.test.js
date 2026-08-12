import './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
 * These mirror `ArincenChart.vue`, `InstrumentChart.vue` and
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

/* ------------------------------------------------------- the tinted gutters */

/**
 * Every gradient rectangle painted outside the plot.
 *
 * `axis-tint.test.js` covers the behaviour under the full-build flag. This
 * asks the separate question a deploy asks: does it survive into the light
 * bundle the site loads. `tintAxes` is not full-build gated, and nothing else
 * in the suite would notice if it became so.
 */
function tintedStrips(chart) {
    const fills = [];

    let style = null;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => {
            const stops = [];

            return { gradient: true, stops, addColorStop: (at, colour) => stops.push({ at, colour }) };
        },
        fillRect: (x, y, width, height) => fills.push({ x, y, width, height, style }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'fillStyle') {
                style = value;
            }

            return true;
        },
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    const plot = chart._internal.plot;

    return fills.filter(
        (fill) => fill.style?.gradient && (fill.x >= plot.right - 1 || fill.y >= plot.bottom - 1),
    );
}

/** The instrument page's area branch, colour and all. */
const areaOptions = (rising = true) => ({
    topColor: rising ? 'rgba(34, 171, 148, 0.36)' : 'rgba(242, 54, 69, 0.36)',
    bottomColor: rising ? 'rgba(34, 171, 148, 0.0)' : 'rgba(242, 54, 69, 0.0)',
    lineColor: rising ? 'rgba(34, 171, 148, 1)' : 'rgba(242, 54, 69, 1)',
    lineWidth: 2,
    tintAxes: true,
});

test('the instrument area chart carries its fill into both gutters', () => {
    const chart = createChart(container(), instrumentOptions());

    chart.addSeries(AreaSeries, areaOptions())
        .setData(candles(200).map((bar) => ({ time: bar.time, value: bar.close })));

    const plot = chart._internal.plot;
    const strips = tintedStrips(chart);

    assert.ok(strips.some((fill) => fill.x >= plot.right - 1), 'the price gutter was left grey');
    assert.ok(strips.some((fill) => fill.y >= plot.bottom - 1), 'the time gutter was left grey');
});

test('a falling instrument chart tints red, not the rising green', () => {
    const chart = createChart(container(), instrumentOptions());

    chart.addSeries(AreaSeries, areaOptions(false))
        .setData(candles(200).map((bar) => ({ time: bar.time, value: bar.close })));

    // The gutters take their colour from the series, so a day in the red that
    // tinted green would be worse than no tint at all.
    const colour = tintedStrips(chart)[0]?.style?.stops?.[0]?.colour;

    assert.ok(colour?.includes('242'), `the gutters were tinted ${colour}`);
});

test('the candlestick branch tints nothing, having no fill to lend', () => {
    const chart = createChart(container(), instrumentOptions());

    // The instrument page switches series type on the same chart. A candle has
    // no dress, so there is nothing to continue.
    chart.addSeries(CandlestickSeries, { tintAxes: true }).setData(candles(200));

    assert.deepEqual(tintedStrips(chart), [], 'a candlestick chart tinted its axes');
});

/**
 * The CMS block decides per chart: `tintAxes: series.length === 1`. Tinted
 * gutters say "this chart is this colour", which is a lie on a chart comparing
 * three lines — and the engine would answer with whichever was added first.
 */
test('a single-series content block tints', () => {
    const chart = createChart(container(), { width: 600, height: 200 });
    const series = [{ colour: '#db2777' }];

    for (const s of series) {
        chart.addSeries(AreaSeries, {
            topColor: 'rgba(219, 39, 119, 0.32)',
            bottomColor: 'rgba(219, 39, 119, 0)',
            lineColor: s.colour,
            tintAxes: series.length === 1,
        }).setData(candles(60).map((bar) => ({ time: bar.time, value: bar.close })));
    }

    assert.ok(tintedStrips(chart).length > 0, 'a chart about one thing did not tint');
});

test('a comparison block does not', () => {
    const chart = createChart(container(), { width: 600, height: 200 });
    const series = [{ colour: '#db2777' }, { colour: '#f97316' }, { colour: '#22ab94' }];

    for (const s of series) {
        chart.addSeries(AreaSeries, {
            topColor: 'rgba(219, 39, 119, 0.32)',
            bottomColor: 'rgba(219, 39, 119, 0)',
            lineColor: s.colour,
            tintAxes: series.length === 1,
        }).setData(candles(60).map((bar) => ({ time: bar.time, value: bar.close })));
    }

    assert.deepEqual(tintedStrips(chart), [], 'a three-series comparison claimed one colour');
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

/* ----------------------------------------------------- the call sites themselves */

/**
 * The configurations above are copies, and a copy cannot notice the original
 * changing. Every test in this file would still pass with `tintAxes` deleted
 * from all four components — the tint would simply stop appearing on the site,
 * silently, which is the failure this file exists to prevent.
 *
 * So the source is read. It is a coarse check by design: it asks whether each
 * area chart still asks for the tint, not whether it looks right.
 */
const sitePath = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const source = (path) => readFileSync(sitePath(path), 'utf8');

/**
 * The public mirror carries this file but not the application around it, so
 * these two have nothing to read there. Skipped rather than failed: a mirror
 * whose test suite fails on a checkout reads as source that was dumped rather
 * than shared, which is the whole thing the mirror exists to avoid.
 */
const siteAbsent = ! existsSync(sitePath('resources/js/Components/InstrumentChart.vue'));

test('every area chart on the site still asks for the tint', { skip: siteAbsent }, () => {
    const sites = [
        'resources/js/Components/InstrumentChart.vue',
        'resources/js/Components/InstrumentChartWrapper.vue',
        'resources/js/Components/Blocks/LineChart.vue',
        'resources/views/components/instrument-chart.blade.php',
        'resources/views/components/line-chart.blade.php',
    ];

    for (const path of sites) {
        assert.match(source(path), /tintAxes/, `${path} stopped tinting its axes`);
    }
});

test('the two multi-series charts still gate it on there being one series', { skip: siteAbsent }, () => {
    // Hard-coding `true` here is the tempting edit, and it is wrong: the
    // gutters would take the first series' colour and label a comparison as
    // though it were about one thing.
    for (const path of [
        'resources/js/Components/Blocks/LineChart.vue',
        'resources/views/components/line-chart.blade.php',
    ]) {
        assert.match(
            source(path),
            /tintAxes:\s*\w+(\.value)?\.length === 1/,
            `${path} tints regardless of how many series it is drawing`,
        );
    }
});
