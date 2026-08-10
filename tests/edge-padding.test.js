import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createChart,
    LineSeries,
    AreaSeries,
    CandlestickSeries,
} from '../src/index.js';

/**
 * What `fitContent` leaves at the edges.
 *
 * Fitting used to place the first and last readings exactly on the boundary,
 * which is defensible — "fit everything" ought to mean the extremes touch the
 * edges — and which every reader reported as a bug, because a stroke centred
 * on x = 0 loses the half of itself that falls off the canvas. Being right
 * about it was worth less than the report it generated each time.
 *
 * The room reserved is the smallest that keeps the mark whole: half a bar for
 * candles, half a stroke for lines. Deliberately not more. `fitContent` still
 * means the extremes sit on the edges — they are simply no longer sliced by the
 * edge they sit on.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

const bars = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    open: 100 + index,
    high: 104 + index,
    low: 98 + index,
    close: 102 + index,
}));

/** Lays the chart out, then reports where the outermost readings landed. */
function edges(chart, count) {
    chart._internal.render();
    chart.timeScale().fitContent();
    chart._internal.render();

    const scale = chart._internal.timeScale;

    return {
        width: scale.width,
        first: scale.indexToX(0),
        last: scale.indexToX(count - 1),
        spacing: scale.barSpacing,
    };
}

test('a line keeps its whole stroke at both edges', () => {
    const chart = createChart(container(), { width: 800, height: 300 });

    chart.addSeries(LineSeries, { lineWidth: 4 }).setData(points(40));

    const { width, first, last } = edges(chart, 40);

    assert.ok(first >= 2, `the first reading sits at ${first}px, so a 4px stroke is cut`);
    assert.ok(last <= width - 2, `the last reading sits at ${last}px of ${width}px, so a 4px stroke is cut`);

    chart.remove();
});

test('a line reserves its stroke and not a pixel more', () => {
    const thin = createChart(container(), { width: 800, height: 300 });
    const thick = createChart(container(), { width: 800, height: 300 });

    thin.addSeries(LineSeries, { lineWidth: 1 }).setData(points(40));
    thick.addSeries(LineSeries, { lineWidth: 8 }).setData(points(40));

    const one = edges(thin, 40);
    const eight = edges(thick, 40);

    // Not half a bar, which would be nine pixels here and would quietly turn
    // `fitContent` into `fitContent with a margin` for every line chart.
    assert.ok(Math.abs(one.first - 0.5) < 0.01, `a 1px line should sit 0.5px in, not ${one.first}`);
    assert.ok(Math.abs(eight.first - 4) < 0.01, `an 8px line should sit 4px in, not ${eight.first}`);

    thin.remove();
    thick.remove();
});

test('the gap does not scale with the zoom for a line', () => {
    const few = createChart(container(), { width: 800, height: 300 });
    const many = createChart(container(), { width: 800, height: 300 });

    few.addSeries(LineSeries, { lineWidth: 6 }).setData(points(20));
    many.addSeries(LineSeries, { lineWidth: 6 }).setData(points(10_000));

    // A stroke is the same width however many readings are behind it, which is
    // what makes this the right unit for a line and the wrong one for a candle.
    assert.ok(Math.abs(edges(few, 20).first - edges(many, 10_000).first) < 0.01);

    few.remove();
    many.remove();
});

test('a visible point marker is measured too', () => {
    const chart = createChart(container(), { width: 800, height: 300 });

    chart.addSeries(LineSeries, { lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 9 })
        .setData(points(40));

    const { first } = edges(chart, 40);

    assert.ok(first >= 9, `a 9px marker needs nine pixels; it got ${first}`);

    chart.remove();
});

test('the gap never eats the chart', () => {
    const chart = createChart(container(), { width: 800, height: 300 });

    // An absurd stroke on two readings: the padding is capped rather than
    // allowed to squeeze the data into nothing.
    chart.addSeries(LineSeries, { lineWidth: 4000 }).setData(points(2));

    const { width, first, last } = edges(chart, 2);

    assert.ok(first <= width / 4, `the left gap took ${first}px of ${width}px`);
    assert.ok(last >= width * 0.75, `the right gap took ${width - last}px of ${width}px`);
    assert.ok(last > first, 'the two readings should still be apart');

    chart.remove();
});

test('candles still reserve half a bar, which is the larger claim', () => {
    const chart = createChart(container(), { width: 800, height: 300 });

    chart.addSeries(CandlestickSeries, {}).setData(bars(40));

    const { first, spacing } = edges(chart, 40);

    assert.ok(
        Math.abs(first - spacing / 2) < 0.01,
        `expected half a bar (${spacing / 2}px) of room, got ${first}px`,
    );

    chart.remove();
});

test('the fit still shows every reading', () => {
    const chart = createChart(container(), { width: 800, height: 300 });

    chart.addSeries(AreaSeries, { lineWidth: 2 }).setData(points(120));

    const { width, first, last } = edges(chart, 120);
    const { from, to } = chart.timeScale().getVisibleLogicalRange();

    assert.ok(first > 0 && last < width, 'both extremes should be inside the plot');
    assert.ok(from <= 0, `the fit hid the start of the data: range begins at ${from}`);
    assert.ok(to >= 119, `the fit hid the end of the data: range ends at ${to}`);

    chart.remove();
});

test('a single reading is still centred rather than pushed off', () => {
    const chart = createChart(container(), { width: 800, height: 300 });

    chart.addSeries(LineSeries, { lineWidth: 2 }).setData(points(1));

    const { width, first } = edges(chart, 1);

    assert.ok(first > 0 && first < width, `a lone reading landed at ${first}px of ${width}px`);

    chart.remove();
});
