import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries, CandlestickSeries } from '../src/index.js';

/**
 * Saying what is wrong with the data instead of drawing it anyway.
 *
 * Every case here is one the chart already absorbed: an unreadable time was
 * skipped, an out-of-order series was quietly sorted, a duplicate replaced its
 * twin, a NaN drew nothing. The chart came out empty, or short by three bars,
 * or flat — and none of those say why, so the suspicion falls on the library
 * rather than on the feed.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

/** Everything the chart said while the data was going in. */
function warnings(run, options = {}) {
    const original = globalThis.console.warn;
    const said = [];

    globalThis.console.warn = (message) => said.push(String(message));

    try {
        const chart = createChart(container(), { width: 600, height: 300, ...options });
        const series = chart.addSeries(LineSeries, {});

        run(series, chart);
        chart.remove();
    } finally {
        globalThis.console.warn = original;
    }

    return said;
}

const complains = (said, about) => said.some((line) => line.includes(about));

/* ------------------------------------------------------------- good data */

test('data with nothing wrong with it is not commented on', () => {
    const said = warnings((series) => series.setData(points(200)));

    assert.deepEqual(said, [], `it complained about clean data: ${said.join(' / ')}`);
});

test('a gap in the readings is not a fault', () => {
    const said = warnings((series) => series.setData([
        { time: start, value: 100 },

        // Whitespace: the one way to say "the market was closed" without
        // inventing a price. Warning about it would train people to ignore
        // the warnings.
        { time: start + day, value: null },
        { time: start + 2 * day, value: 102 },
    ]));

    assert.deepEqual(said, []);
});

test('an empty series is not a fault either', () => {
    assert.deepEqual(warnings((series) => series.setData([])), []);
});

/* ---------------------------------------------------------------- times */

test('readings whose time cannot be read are counted, not dropped in silence', () => {
    const said = warnings((series) => series.setData([
        { time: start, value: 100 },
        { time: 'not a date', value: 101 },
        { time: undefined, value: 102 },
    ]));

    assert.ok(complains(said, '2 of 3 readings'), said.join(' / ') || 'nothing was said');
});

test('milliseconds are not complained about, because they work', () => {
    const said = warnings((series) => series.setData(
        points(10).map((point) => ({ ...point, time: point.time * 1000 })),
    ));

    // Nearly shipped a warning for this. `toTimestamp` converts milliseconds
    // to seconds on the way in, so the chart is correct — and a warning about
    // something the library handles is how a set of warnings starts being
    // ignored wholesale.
    assert.deepEqual(said, [], said.join(' / '));
});

test('an out-of-order feed is sorted, and said so', () => {
    const said = warnings((series) => series.setData([...points(10)].reverse()));

    // Sorting is a kindness the caller cannot see happening, which is why it
    // has to be mentioned: out-of-order usually means two responses were
    // concatenated, and the next thing to go wrong is a duplicate.
    assert.ok(complains(said, 'out of order'), said.join(' / ') || 'nothing was said');
});

test('duplicated times are counted', () => {
    const said = warnings((series) => series.setData([
        { time: start, value: 100 },
        { time: start, value: 101 },
        { time: start + day, value: 102 },
    ]));

    assert.ok(complains(said, '1 reading shares a time'), said.join(' / ') || 'nothing was said');
});

/* --------------------------------------------------------------- values */

test('a NaN among the prices is named', () => {
    const said = warnings((series) => series.setData([
        { time: start, value: 100 },
        { time: start + day, value: Number.NaN },
    ]));

    assert.ok(complains(said, 'not a finite number'), said.join(' / ') || 'nothing was said');
});

test('a price arriving as a string is named too', () => {
    const said = warnings((series) => series.setData([
        { time: start, value: 100 },

        // JSON from an API that quotes its numbers. It draws, badly, and
        // compares wrongly against every other price on the chart.
        { time: start + day, value: '101.5' },
    ]));

    assert.ok(complains(said, 'not a finite number'), said.join(' / ') || 'nothing was said');
});

test('a candle with its high below its low is named', () => {
    const original = globalThis.console.warn;
    const said = [];

    globalThis.console.warn = (message) => said.push(String(message));

    try {
        const chart = createChart(container(), { width: 600, height: 300 });

        chart.addSeries(CandlestickSeries, {}).setData([
            { time: start, open: 100, high: 90, low: 110, close: 105 },
        ]);

        chart.remove();
    } finally {
        globalThis.console.warn = original;
    }

    assert.ok(complains(said, '1 bar has a high below its low'), said.join(' / ') || 'nothing was said');
});

/* -------------------------------------------------------- the whole call */

test('setData given something that is not an array says so', () => {
    // The shape of a fetch that returned `{ data: [...] }` and was handed over
    // whole. Today that draws an empty chart with no explanation at all.
    const said = warnings((series) => series.setData({ data: points(10) }));

    assert.ok(complains(said, 'expected an array'), said.join(' / ') || 'nothing was said');
});

/* -------------------------------------------------------------- updates */

test('a live tick going backwards is named', () => {
    const said = warnings((series) => {
        series.setData(points(10));
        series.update({ time: start + 3 * day, value: 50 });
    });

    assert.ok(complains(said, 'older than the last one'), said.join(' / ') || 'nothing was said');
});

test('a tick replacing the newest bar is normal and silent', () => {
    const said = warnings((series) => {
        series.setData(points(10));
        series.update({ time: start + 9 * day, value: 999 });
        series.update({ time: start + 10 * day, value: 1000 });
    });

    // The commonest call in the library: a price arriving for the bar that is
    // still open, then for the next one.
    assert.deepEqual(said, []);
});

test('a tick with an unreadable time is named rather than ignored', () => {
    const said = warnings((series) => {
        series.setData(points(10));
        series.update({ time: 'yesterday', value: 100 });
    });

    assert.ok(complains(said, 'could not read'), said.join(' / ') || 'nothing was said');
});

/* ---------------------------------------------------------- the plumbing */

test('the same complaint is made once, however many times it is true', () => {
    const said = warnings((series) => {
        for (let round = 0; round < 20; round++) {
            series.setData([...points(10)].reverse());
        }
    });

    // A chart that reloads its data on every timeframe change would otherwise
    // fill the console with the same line.
    assert.equal(said.length, 1, `said ${said.length} times`);
});

test('it can be turned off', () => {
    const said = warnings(
        (series) => series.setData([...points(10)].reverse()),
        { validateData: false },
    );

    assert.deepEqual(said, []);
});

test('turning it off does not change what is drawn', () => {
    const build = (validateData) => {
        const chart = createChart(container(), { width: 600, height: 300, validateData });
        const series = chart.addSeries(LineSeries, {});

        series.setData([...points(10)].reverse());

        const drawn = series._internal ? series._internal.points : chart._internal.allSeries[0].points;

        chart.remove();

        return drawn.map((point) => point.ts);
    };

    const original = globalThis.console.warn;

    globalThis.console.warn = () => {};

    try {
        // Validation looks at the data and says things about it. It must not
        // be load-bearing: a chart that draws differently with warnings off is
        // a chart nobody can turn them off on.
        assert.deepEqual(build(true), build(false));
    } finally {
        globalThis.console.warn = original;
    }
});

test('a numeric feed out of order is caught, not read as text', () => {
    // The order used to be judged by comparing the caller's own `time` values
    // as strings. Ten-digit unix seconds all have the same length, so it
    // happened to work — until a nine-digit one, where '999999999' sorts after
    // '1000000000' and a reversed feed reads as perfectly ordered.
    const said = warnings((series) => series.setData([
        { time: 1000000000, value: 100 },
        { time: 999999999, value: 101 },
    ]));

    assert.ok(complains(said, 'out of order'), said.join(' / ') || 'nothing was said');
});

test('a business-day feed out of order is caught too', () => {
    const said = warnings((series) => series.setData([
        { time: '2024-03-01', value: 100 },
        { time: '2024-02-01', value: 101 },
    ]));

    assert.ok(complains(said, 'out of order'), said.join(' / ') || 'nothing was said');
});
