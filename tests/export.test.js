import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createChart,
    LineSeries,
    CandlestickSeries,
} from '../src/full.js';

/**
 * Taking the chart away: as its numbers, or as a picture.
 *
 * Both are asked for constantly and neither belongs in a page's own code. A
 * screenshot means knowing there are two canvases and that the visible one is
 * scaled by the device ratio; a CSV means reaching into series internals for
 * readings the chart already holds in the right order.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const values = (count, from = 100) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: from + index,
}));

const candles = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
}));

function chartWith(build, options = {}) {
    const chart = createChart(container(), { width: 600, height: 300, ...options });

    build(chart);
    chart.timeScale().fitContent();
    chart._internal.render();

    return chart;
}

const rows = (csv) => csv.split('\n');

/* -------------------------------------------------------------------- CSV */

test('one row per time, one column per series', () => {
    const chart = chartWith((made) => {
        made.addSeries(LineSeries, { title: 'AAPL' }).setData(values(3));
        made.addSeries(LineSeries, { title: 'MSFT' }).setData(values(3, 200));
    });

    const lines = rows(chart.toCSV());

    // The shape somebody opening it in Excel expects, rather than one block
    // per series stacked down the page.
    assert.equal(lines[0], 'time,AAPL,MSFT');
    assert.equal(lines[1], '2024-01-01,100,200');
    assert.equal(lines.length, 4);

    chart.remove();
});

test('a candlestick writes all four prices', () => {
    const chart = chartWith((made) => made.addSeries(CandlestickSeries, { title: 'ARN' }).setData(candles(2)));

    assert.equal(rows(chart.toCSV())[0], 'time,ARN open,ARN high,ARN low,ARN close');
    assert.equal(rows(chart.toCSV())[1], '2024-01-01,100,102,99,101');

    chart.remove();
});

test('a day of dojis is still a candlestick', () => {
    const chart = chartWith((made) => made.addSeries(CandlestickSeries, { title: 'FLAT' }).setData([
        { time: start, open: 2, high: 3, low: 1, close: 2 },
    ]));

    // Decided from the series type, not by comparing open against close: the
    // first version read a day where nothing closed away from its open as a
    // line chart, and dropped every high and low.
    assert.equal(rows(chart.toCSV())[0], 'time,FLAT open,FLAT high,FLAT low,FLAT close');

    chart.remove();
});

test('a series with no title is numbered rather than left blank', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, {}).setData(values(2)));

    assert.equal(rows(chart.toCSV())[0], 'time,series 1');

    chart.remove();
});

test('a series missing a reading leaves the cell empty', () => {
    const chart = chartWith((made) => {
        made.addSeries(LineSeries, { title: 'A' }).setData(values(3));
        made.addSeries(LineSeries, { title: 'B' }).setData([{ time: start, value: 50 }]);
    });

    // A gap in a feed is not the same fact as a price that did not move, so
    // nothing is carried forward into it.
    assert.equal(rows(chart.toCSV())[2], '2024-01-02,101,');

    chart.remove();
});

test('times are written as dates, and carry the clock when the chart does', () => {
    const daily = chartWith((made) => made.addSeries(LineSeries, {}).setData(values(2)));

    assert.match(rows(daily.toCSV())[1], /^2024-01-01,/);

    const intraday = chartWith(
        (made) => made.addSeries(LineSeries, {}).setData([{ time: start + 3600 * 9 + 1800, value: 1 }]),
        { timeScale: { timeVisible: true } },
    );

    // A unix timestamp opens in Excel as a large integer, which is the one
    // format nobody can read.
    assert.match(rows(intraday.toCSV())[1], /^2024-01-01 09:30:00,/);

    daily.remove();
    intraday.remove();
});

test('a field that would break the row is quoted', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, { title: 'A,B "x"' }).setData(values(1)));

    assert.equal(rows(chart.toCSV())[0], 'time,"A,B ""x"""');

    chart.remove();
});

test('the separator can be changed for a locale that uses commas for decimals', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, { title: 'A' }).setData(values(1)));

    assert.equal(rows(chart.toCSV({ separator: ';' }))[0], 'time;A');

    chart.remove();
});

test('everything by default, and only what is on screen when asked', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, { title: 'A' }).setData(values(50)));

    assert.equal(rows(chart.toCSV()).length, 51);

    chart.timeScale().setVisibleLogicalRange({ from: 10, to: 19 });
    chart._internal.render();

    const visible = rows(chart.toCSV({ visible: true }));

    assert.ok(visible.length > 1 && visible.length <= 13, `${visible.length - 1} rows for ten bars`);
    assert.ok(visible.some((line) => line.startsWith('2024-01-11')), 'the visible rows are the wrong ones');

    chart.remove();
});

test('a chart with nothing on it exports nothing, rather than a lone header', () => {
    const chart = chartWith(() => {});

    assert.equal(chart.toCSV(), '');

    chart.remove();
});

/* ------------------------------------------------------------------ image */

/** A canvas that records what was drawn onto it. */
function recordingCanvas() {
    const drawn = [];
    const fills = [];

    let fillStyle = null;

    return {
        drawn,
        fills,
        element: {
            width: 0,
            height: 0,
            getContext: () => ({
                set fillStyle(value) {
                    fillStyle = value;
                },
                get fillStyle() {
                    return fillStyle;
                },
                fillRect: (...args) => fills.push({ args, fillStyle }),
                drawImage: (source) => drawn.push(source),
            }),
            toDataURL: (type) => `data:${type ?? 'image/png'};base64,STUB`,
        },
    };
}

function imaged(chart, options) {
    const canvas = recordingCanvas();
    const original = chart.chartElement().ownerDocument.createElement;

    chart.chartElement().ownerDocument.createElement = (tag) => (
        tag === 'canvas' ? canvas.element : original.call(document, tag)
    );

    try {
        return { url: chart.toImage(options), ...canvas };
    } finally {
        chart.chartElement().ownerDocument.createElement = original;
    }
}

test('both canvases go into the picture', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, {}).setData(values(20)));
    const taken = imaged(chart);

    // A screenshot of the visible canvas alone loses the crosshair and its
    // labels — on a chart somebody is pointing at, the part they meant to
    // capture.
    assert.equal(taken.drawn.length, 2);
    assert.equal(taken.drawn[0], chart._internal.mainCanvas);
    assert.equal(taken.drawn[1], chart._internal.overlayCanvas);

    chart.remove();
});

test('it is a PNG unless another type is asked for', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, {}).setData(values(5)));

    assert.match(imaged(chart).url, /^data:image\/png;/);
    assert.match(imaged(chart, { type: 'image/jpeg' }).url, /^data:image\/jpeg;/);

    chart.remove();
});

test('the picture is the size of the canvas that was drawn', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, {}).setData(values(5)));
    const taken = imaged(chart);

    // Copied rather than recomputed from the device ratio: the two agree until
    // a window moves between a retina screen and an external monitor, and a
    // recomputed size crops the picture.
    assert.equal(taken.element.width, chart._internal.mainCanvas.width);
    assert.equal(taken.element.height, chart._internal.mainCanvas.height);

    chart.remove();
});

test('nothing is painted underneath unless a background is asked for', () => {
    const chart = chartWith((made) => made.addSeries(LineSeries, {}).setData(values(5)));

    assert.deepEqual(imaged(chart).fills, []);

    const filled = imaged(chart, { background: '#ffffff' });

    // A transparent PNG dropped into a document lands on whatever colour that
    // document uses — often black text on black.
    assert.equal(filled.fills.length, 1);
    assert.equal(filled.fills[0].fillStyle, '#ffffff');

    chart.remove();
});
