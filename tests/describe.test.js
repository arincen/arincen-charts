import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createChart,
    LineSeries,
    CandlestickSeries,
    createSeriesMarkers,
} from '../src/full.js';

/**
 * The chart, in words.
 *
 * Everything that is not a pair of eyes — a language model, a screen reader,
 * an alerting job — has to reach the numbers some other way, and today that
 * means writing the same summary again, badly, in every project.
 *
 * What it must not do is interpret. "Bullish" and "resistance" are conclusions
 * somebody else gets to draw; this says what is drawn, over what period, where
 * it ended and how far it moved.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const rising = (count = 100) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

const candles = (count = 100) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    open: 100 + index,
    high: 104 + index,
    low: 98 + index,
    close: 102 + index,
}));

function built(build, options = {}) {
    const chart = createChart(container(), { width: 800, height: 300, ...options });

    build(chart);
    chart.timeScale().fitContent();
    chart._internal.render();

    return chart;
}

/* ------------------------------------------------------------ nothing to say */

test('a chart with no series says so', () => {
    assert.match(built(() => {}).toText(), /empty chart: no series/);
});

test('a chart whose series are empty says that instead', () => {
    const chart = built((made) => made.addSeries(LineSeries, {}).setData([]));

    assert.match(chart.toText(), /empty chart: 1 series, no readings/);
});

/* ------------------------------------------------------------------ the shape */

test('it opens with what is drawn and over what period', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising()));

    assert.match(chart.toText(), /^A chart of 1 series over 100 readings, 2024-01-01 to 2024-04-09\./);

    chart.remove();
});

test('a series is named by its title, and numbered when it has none', () => {
    const titled = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(5)));
    const bare = built((made) => made.addSeries(LineSeries, {}).setData(rising(5)));

    assert.match(titled.toText(), /AAPL \(line\)/);
    assert.match(bare.toText(), /series 1 \(line\)/);
});

test('each series reports where it ended, its extremes, and when they happened', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(10)));

    assert.match(
        chart.toText(),
        /AAPL \(line\): last 109\.00, high 109\.00 on 2024-01-10, low 100\.00 on 2024-01-01, up 9\.00% over the period\./,
    );

    chart.remove();
});

test('a candlestick is measured on its highs and lows, not its closes', () => {
    const chart = built((made) => made.addSeries(CandlestickSeries, { title: 'ARN' }).setData(candles(10)));

    // The high of a candlestick chart is the highest wick, which is the number
    // a reader would give if asked. Reading `close` understates it every time.
    assert.match(chart.toText(), /high 113\.00 on 2024-01-10/);
    assert.match(chart.toText(), /low 98\.00 on 2024-01-01/);

    chart.remove();
});

test('a fall is described as a fall', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'X' })
        .setData(rising(10).map((point, index) => ({ ...point, value: 200 - index * 10 }))));

    assert.match(chart.toText(), /down 45\.00% over the period/);

    chart.remove();
});

/* ------------------------------------------------------------ what is on screen */

test('it describes the visible window, and says that it is doing so', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(100)));

    chart.timeScale().setVisibleLogicalRange({ from: 80, to: 99 });
    chart._internal.render();

    const said = chart.toText();

    // A model told "high 150" about a chart holding five years will say the
    // wrong thing about the other four, so the window is stated outright.
    assert.match(said, /Showing 2024-03-\d\d to 2024-04-09, \d+ of them\./);
    assert.match(said, /last 199\.00/);
    assert.ok(! /low 100\.00/.test(said), 'it described readings that are not on screen');

    chart.remove();
});

test('and the whole series when asked', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(100)));

    chart.timeScale().setVisibleLogicalRange({ from: 80, to: 99 });
    chart._internal.render();

    const said = chart.toText({ visible: false });

    assert.match(said, /low 100\.00 on 2024-01-01/);
    assert.ok(! /Showing/.test(said), 'it claimed a window while describing everything');

    chart.remove();
});

test('a chart showing everything does not announce a window', () => {
    const chart = built((made) => made.addSeries(LineSeries, {}).setData(rising(20)));

    assert.ok(! /Showing/.test(chart.toText()));

    chart.remove();
});

/* --------------------------------------------------------------- the details */

test('a hidden series is not described', () => {
    const chart = built((made) => {
        made.addSeries(LineSeries, { title: 'Shown' }).setData(rising(10));
        made.addSeries(LineSeries, { title: 'Hidden', visible: false }).setData(rising(10));
    });

    assert.match(chart.toText(), /Shown/);
    assert.ok(! /Hidden/.test(chart.toText()), 'a series nobody can see was described');

    chart.remove();
});

test('prices are written the way the chart writes them', () => {
    const chart = built(
        (made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(5)),
        { localization: { priceFormatter: (value) => `$${value.toFixed(2)}` } },
    );

    // A chart labelled in dollars that describes itself in bare numbers is
    // describing a different chart.
    assert.match(chart.toText(), /last \$104\.00/);

    chart.remove();
});

test('markers and price lines are counted', () => {
    const chart = built((made) => {
        const series = made.addSeries(LineSeries, { title: 'AAPL' });

        series.setData(rising(10));
        series.createPriceLine({ price: 105, title: 'alert' });
        createSeriesMarkers(series, [
            { time: start + 2 * day, position: 'aboveBar', shape: 'circle', text: 'a' },
            { time: start + 4 * day, position: 'aboveBar', shape: 'circle', text: 'b' },
        ]);
    });

    assert.match(chart.toText(), /2 markers, 1 price line\./);

    chart.remove();
});

test('an intraday chart carries the clock into its dates', () => {
    const chart = built(
        (made) => made.addSeries(LineSeries, { title: 'X' }).setData(
            Array.from({ length: 8 }, (_, index) => ({
                time: start + 9 * 3600 + index * 1800,
                value: 100 + index,
            })),
        ),
        { timeScale: { timeVisible: true } },
    );

    assert.match(chart.toText(), /2024-01-01 09:00 to 2024-01-01 12:30/);

    chart.remove();
});

/* ------------------------------------------------------------- what it is not */

test('it states, and does not interpret', () => {
    const chart = built((made) => made.addSeries(CandlestickSeries, { title: 'ARN' }).setData(candles(60)));
    const said = chart.toText().toLowerCase();

    // The judgement belongs to whoever is reading. A library that says
    // "bullish" has taken a position on somebody else's money.
    for (const word of ['bullish', 'bearish', 'resistance', 'support', 'trend', 'strong', 'weak', 'signal']) {
        assert.ok(! said.includes(word), `it offered an opinion: "${word}"`);
    }

    chart.remove();
});

test('the same chart says the same thing twice', () => {
    const chart = built((made) => made.addSeries(LineSeries, { title: 'AAPL' }).setData(rising(30)));

    // Deterministic, because it is going into a prompt and a cache.
    assert.equal(chart.toText(), chart.toText());

    chart.remove();
});
