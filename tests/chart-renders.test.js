import './support/full-build.js';
import { container, renderCounting } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, CandlestickSeries, LineSeries } from '../src/index.js';

/**
 * A chart is built and asked to draw.
 *
 * Everything else in this suite tests a function on its own, and that let a
 * chart ship that threw on every single frame: `drawSeries` called a method
 * that had never been added to the class, so every full build drew its grid
 * and then died. Two hundred and forty-five passing tests, a completely broken
 * library, and it took somebody clicking a button four times to find it.
 *
 * These are slower and coarser than the rest. That is the trade: they are the
 * only ones that would have caught it.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

function candles(count) {
    const bars = new Array(count);
    let price = 100;
    let seed = 12345;

    for (let i = 0; i < count; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;

        const noise = seed / 0x7fffffff - 0.5;
        const open = price;
        const close = open + noise * 0.6 + (100 - open) * 0.0004;

        bars[i] = {
            time: start + i * day,
            open,
            close,
            high: Math.max(open, close) + 0.3,
            low: Math.min(open, close) - 0.3,
        };
        price = close;
    }

    return bars;
}

function chartWith(options, data, definition = CandlestickSeries) {
    const chart = createChart(container(), { width: 1500, height: 400, ...options });
    const series = chart.addSeries(definition, {});

    series.setData(data);
    chart.timeScale().fitContent();

    return { chart, series };
}

test('a chart draws its series', () => {
    const { chart } = chartWith({}, candles(300));

    assert.ok(renderCounting(chart) > 100, 'the chart drew almost nothing');
});

test('a line chart draws too', () => {
    const data = candles(300).map((bar) => ({ time: bar.time, value: bar.close }));
    const { chart } = chartWith({}, data, LineSeries);

    renderCounting(chart);
});

/**
 * The case that was broken: conflation on. The option turns a code path on
 * that nothing else in the suite reached.
 */
test('a chart draws with conflation switched on', () => {
    const { chart } = chartWith({ timeScale: { enableConflation: true } }, candles(20_000));

    assert.ok(renderCounting(chart) > 100, 'nothing was drawn with conflation on');
});

test('conflation draws a fraction of the data, not all of it', () => {
    const plain = chartWith({}, candles(20_000));
    const merged = chartWith({ timeScale: { enableConflation: true } }, candles(20_000));

    const without = renderCounting(plain.chart);
    const merged_ = renderCounting(merged.chart);

    // Twenty thousand candles across fifteen hundred pixels is a stride of
    // four, so the saving is exactly fourfold — asserted as "at least three"
    // rather than "more than four", which is the same claim without depending
    // on the arithmetic landing on a particular power of two.
    assert.ok(
        merged_ * 3 <= without,
        `conflation drew ${merged_} where plain drew ${without}`,
    );
});

test('a chart survives being drawn twice', () => {
    const { chart } = chartWith({ timeScale: { enableConflation: true } }, candles(5_000));

    renderCounting(chart);
    renderCounting(chart);
});

test('a chart with no data at all still draws its frame', () => {
    const { chart } = chartWith({}, []);

    renderCounting(chart);
});

test('a chart draws after data is appended', () => {
    const { chart, series } = chartWith({ timeScale: { enableConflation: true } }, candles(5_000));

    renderCounting(chart);
    series.update({ time: start + 5_000 * day, open: 100, high: 101, low: 99, close: 100.5 });

    assert.ok(renderCounting(chart) > 10, 'the chart stopped drawing after an update');
});

/**
 * Panning is where a stride and a viewport can disagree — the drawing starts
 * at the run containing the left edge, not at the edge, and an off-by-one
 * there shows up as a chart that draws once and then throws.
 */
test('a conflated chart survives being panned', () => {
    const { chart } = chartWith({ timeScale: { enableConflation: true } }, candles(50_000));

    for (const position of [0, -50, -500, -5_000, 200]) {
        chart.timeScale().scrollToPosition(position, false);
        renderCounting(chart);
    }
});

test('a conflated chart survives being zoomed through every level', () => {
    const { chart } = chartWith({ timeScale: { enableConflation: true } }, candles(50_000));

    for (const bars of [50_000, 10_000, 1_000, 100, 20]) {
        chart.timeScale().setVisibleLogicalRange({ from: 49_999 - bars, to: 49_999 });
        renderCounting(chart);
    }
});

/**
 * The defect: the ladder was built when the option was on and never cleared
 * when it went off, so a caller could turn conflation off and go on getting
 * it. It also made the benchmark on the demo page compare conflation against
 * itself and report no difference, which is how it was found.
 */
test('turning conflation off actually turns it off', () => {
    const data = candles(20_000);
    const { chart, series } = chartWith({ timeScale: { enableConflation: true } }, data);

    const conflated = renderCounting(chart);

    chart.applyOptions({ timeScale: { enableConflation: false } });
    series.setData(data);
    chart.timeScale().fitContent();

    const plain = renderCounting(chart);

    assert.ok(
        plain > conflated * 2,
        `after switching it off the chart still drew only ${plain}, against ${conflated} with it on`,
    );
});

test('turning it back on conflates again', () => {
    const data = candles(20_000);
    const { chart, series } = chartWith({}, data);

    const plain = renderCounting(chart);

    chart.applyOptions({ timeScale: { enableConflation: true } });
    series.setData(data);
    chart.timeScale().fitContent();

    assert.ok(renderCounting(chart) * 2 < plain, 'switching it back on did nothing');
});
