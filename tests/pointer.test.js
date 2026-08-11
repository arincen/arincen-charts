import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';

/**
 * `pointer()` is `subscribeCrosshairMove` asked as a question instead of
 * answered as an event. Everything here goes through the public API, because
 * the reason it exists is a caller who arrives after the pointer moved and has
 * no handler registered — an agent, a button, an assistant answering "what is
 * this candle?".
 */
const chartWith = (points) => {
    const chart = createChart(container(), { width: 400, height: 300 });
    const series = chart.addSeries(LineSeries, {});

    series.setData(points);
    chart.timeScale().fitContent();

    return { chart, series };
};

const data = [
    { time: '2026-01-01', value: 100 },
    { time: '2026-01-02', value: 110 },
    { time: '2026-01-03', value: 105 },
];

test('nothing under the pointer is an answer, not a failure', () => {
    const { chart } = chartWith(data);

    assert.equal(chart.pointer(), null);
});

test('it reports the time, the price and the reading under the pointer', () => {
    const { chart, series } = chartWith(data);

    chart.setCrosshairPosition(110, '2026-01-02', series);

    const at = chart.pointer();

    assert.equal(at.time, '2026-01-02');
    assert.equal(at.logical, 1);
    assert.ok(Math.abs(at.price - 110) < 0.5, `price was ${at.price}`);
    assert.deepEqual(at.seriesData.get(series), { time: '2026-01-02', value: 110 });
});

/**
 * The defect this locks down: reading the price off the pane's first scale
 * rather than off the scale the crosshair was placed against. On a chart with
 * an overlay on a second scale that reports a plausible number from the wrong
 * axis, which is worse than reporting nothing.
 */
test('the price comes from the scale the crosshair was placed on', () => {
    const chart = createChart(container(), { width: 400, height: 300 });
    const left = chart.addSeries(LineSeries, { priceScaleId: 'left' });

    chart.addSeries(LineSeries, {}).setData(data);
    left.setData([
        { time: '2026-01-01', value: 1 },
        { time: '2026-01-02', value: 2 },
        { time: '2026-01-03', value: 3 },
    ]);
    chart.timeScale().fitContent();

    chart.setCrosshairPosition(2, '2026-01-02', left);

    assert.ok(Math.abs(chart.pointer().price - 2) < 0.2, 'the left scale reads in single digits');
});

test('it clears when the pointer leaves', () => {
    const { chart, series } = chartWith(data);

    chart.setCrosshairPosition(110, '2026-01-02', series);
    chart.clearCrosshairPosition();

    assert.equal(chart.pointer(), null);
});
