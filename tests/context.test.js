import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries, CandlestickSeries } from '../src/full.js';

/**
 * The chart as data rather than as a sentence.
 *
 * The rule this file exists to hold: the object and the text are two renderings
 * of one reading. Two implementations of "the high" is how a chart ends up
 * saying 150 in prose and 148 in JSON, and whoever is on the wrong side of that
 * has no way of knowing.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const rising = (count = 40) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

function built(build) {
    const chart = createChart(container(), { width: 800, height: 300 });

    build(chart);
    chart.timeScale().fitContent();
    chart._internal.render();

    return chart;
}

test('it reports the window, the data and each series', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(40)));

    const context = chart.toContext();

    assert.equal(context.data.bars, 40);
    assert.equal(context.range.whole, true);
    assert.equal(context.series.length, 1);

    const [series] = context.series;

    assert.equal(series.title, 'AAPL');
    assert.equal(series.type, 'line');
    assert.equal(series.visible, true);
    assert.equal(series.first, 100);
    assert.equal(series.last, 139);
    assert.equal(series.high.price, 139);
    assert.equal(series.low.price, 100);
    assert.equal(series.changePercent, 39);

    chart.remove();
});

test('the object and the sentence describe the same high', () => {
    const chart = built((made) => made.addSeries(CandlestickSeries, { title: 'ARN' }).setData(
        Array.from({ length: 30 }, (_, index) => ({
            time: start + index * day,
            open: 100 + index,
            high: 104 + index,
            low: 98 + index,
            close: 102 + index,
        })),
    ));

    const context = chart.toContext();
    const said = chart.toText();

    // The wick, in both — not the close in one and the wick in the other.
    assert.equal(context.series[0].high.price, 133);
    assert.match(said, /high 133\.00/);

    chart.remove();
});

test('it takes the same period as toText, without moving the view', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(40)));
    const before = chart.timeScale().getVisibleRange();

    const context = chart.toContext({ from: start + 10 * day, to: start + 20 * day });

    assert.equal(context.range.bars, 11);
    assert.equal(context.range.whole, false);
    assert.equal(context.series[0].first, 110);
    assert.equal(context.series[0].last, 120);

    assert.deepEqual(chart.timeScale().getVisibleRange(), before, 'the view moved');

    chart.remove();
});

test('it carries what has been drawn, and where the pointer is', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(40)));
    const [series] = chart.toContext().series;

    assert.equal(series.title, 'AAPL');
    assert.equal(chart.toContext().pointer, null);

    chart.annotate([
        { time: start + 5 * day, price: 105, text: 'a point' },
        { price: 120, text: 'a level' },
        { from: start + 2 * day, to: start + 8 * day, text: 'a region' },
    ]);

    const drawn = chart.toContext().drawn;

    assert.equal(drawn.markers, 1);
    assert.equal(drawn.priceLines, 1);
    assert.equal(drawn.regions, 1);

    chart.remove();
});

test('a series with no readings is reported rather than dropped', () => {
    const chart = built((made) => {
        made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(40));
        made.addSeries(LineSeries, { title: 'EMPTY' }).setData([]);
    });

    const empty = chart.toContext().series.find((entry) => entry.title === 'EMPTY');

    assert.equal(empty.readings, 0);
    assert.equal(empty.last, undefined);

    chart.remove();
});
