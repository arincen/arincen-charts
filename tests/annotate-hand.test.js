import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';

/**
 * The hand: what an agent draws, and what it can take back.
 *
 * Everything here is about the second question in a conversation. The first is
 * "mark the breakout", which already worked. The second is "no, remove the
 * resistance line" — and until this file existed the only answer was to clear
 * everything and draw it all again.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const data = Array.from({ length: 30 }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

function built() {
    const chart = createChart(container(), { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries, { title: 'ARN' });

    series.setData(data);
    chart.timeScale().fitContent();
    chart._internal.render();

    return { chart, series };
}

/* ------------------------------------------------------------- trend lines */

test('two ends carrying a price is a line, not a region', () => {
    const { chart } = built();

    chart.annotate([{
        from: { time: data[2].time, price: 102 },
        to: { time: data[20].time, price: 120 },
        text: 'support',
    }]);

    const [drawn] = chart._internal.annotations;

    assert.equal(drawn.kind, 'trend');
    assert.equal(drawn.ends.length, 2);

    chart.remove();
});

test('two ends without prices is still a region', () => {
    const { chart } = built();

    chart.annotate([{ from: data[2].time, to: data[20].time, text: 'a stretch' }]);

    assert.equal(chart._internal.annotations[0].kind, 'region');

    chart.remove();
});

/* -------------------------------------------------------------------- ids */

test('one note comes off without disturbing the others', () => {
    const { chart, series } = built();

    const notes = chart.annotate([
        { price: 120, text: 'resistance' },
        { time: data[10].time, price: 110, text: 'breakout' },
        { from: data[2].time, to: data[8].time, text: 'a run' },
    ]);

    assert.equal(notes.ids.length, 3);

    assert.equal(notes.remove(notes.ids[0]), true, 'the level was there');

    assert.equal(series.markers().length, 1, 'the marker stayed');
    assert.equal(chart._internal.annotations.length, 1, 'the region stayed');

    assert.equal(notes.remove('never-drawn'), false);

    chart.remove();
});

test('an id of your own is kept', () => {
    const { chart } = built();

    const notes = chart.annotate([{ id: 'resistance', price: 120, text: 'resistance' }]);

    assert.deepEqual(notes.ids, ['resistance']);
    assert.equal(notes.remove('resistance'), true);

    chart.remove();
});

/* ------------------------------------------------------------------ reset */

test('reset takes back everything drawn across every call', () => {
    const { chart, series } = built();

    chart.annotate([{ time: data[5].time, price: 105, text: 'one' }]);
    chart.annotate([{ from: data[1].time, to: data[4].time, text: 'two' }]);
    chart.annotate([{ price: 118, text: 'three' }]);

    chart.reset();

    assert.equal(series.markers().length, 0);
    assert.equal(chart._internal.annotations.length, 0);

    chart.remove();
});

test('reset leaves the page its own markers', () => {
    const { chart, series } = built();

    series.setMarkers?.([{ time: data[3].time, position: 'aboveBar', shape: 'arrowUp', text: 'ours' }]);
    chart.annotate([{ time: data[5].time, price: 105, text: 'theirs' }]);

    chart.reset();

    const left = series.markers();

    assert.equal(left.length, 1);
    assert.equal(left[0].text, 'ours');

    chart.remove();
});

/* --------------------------------------------------- what a model sends back */

test('JSON in a markdown fence is read rather than refused', () => {
    const { chart } = built();

    const notes = chart.annotate('```json\n[{ "price": 120, "text": "resistance" }]\n```');

    assert.equal(notes.notes.length, 1);
    assert.equal(notes.notes[0].price, 120);

    chart.remove();
});

test('one note where an array was asked for', () => {
    const { chart } = built();

    assert.equal(chart.annotate({ price: 120, text: 'resistance' }).notes.length, 1);

    // And the shape a tool schema encourages, where the array is under the
    // parameter's own name.
    assert.equal(chart.annotate({ notes: [{ price: 118, text: 'also' }] }).notes.length, 1);

    chart.remove();
});

test('a label under another name, and a price as a string', () => {
    const { chart } = built();

    const notes = chart.annotate([
        { price: '120.5', label: 'resistance' },
        { level: 118, title: 'support' },
    ]);

    assert.equal(notes.notes[0].price, 120.5);
    assert.equal(notes.notes[0].text, 'resistance');
    assert.equal(notes.notes[1].price, 118);
    assert.equal(notes.notes[1].text, 'support');

    chart.remove();
});

test('start and end instead of from and to', () => {
    const { chart } = built();

    chart.annotate([{ start: data[2].time, end: data[8].time, text: 'a run' }]);

    assert.equal(chart._internal.annotations.length, 1);

    chart.remove();
});

test('a string that is not JSON draws nothing and says so', () => {
    const { chart } = built();

    const notes = chart.annotate('I could not find anything worth marking.');

    assert.equal(notes.notes.length, 0);
    assert.equal(chart._internal.annotations.length, 0);

    chart.remove();
});
