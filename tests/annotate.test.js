import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries, createSeriesMarkers } from '../src/full.js';

/**
 * Drawing back what something else worked out.
 *
 * The other half of `toText`. Doing this by hand means knowing that a point is
 * a marker, a level is a price line and a region is a primitive somebody has
 * to write — three unrelated APIs for one list of notes.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const values = (count = 40) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

function charted(count = 40) {
    const chart = createChart(container(), { width: 800, height: 300 });
    const series = chart.addSeries(LineSeries, { title: 'AAPL' });

    series.setData(values(count));
    chart.timeScale().fitContent();
    chart._internal.render();

    return { chart, series, record: chart._internal.allSeries[0] };
}

/* ------------------------------------------------------------- the three kinds */

test('a note with a time and a price becomes a marker', () => {
    const { chart, record } = charted();

    chart.annotate([{ time: start + 10 * day, price: 110, text: 'gap up' }]);

    assert.equal(record.markers.length, 1);
    assert.equal(record.markers[0].text, 'gap up');

    chart.remove();
});

test('a note with only a price becomes a level across the chart', () => {
    const { chart, record } = charted();

    chart.annotate([{ price: 125, text: 'level' }]);

    assert.equal(record.priceLines.length, 1);
    assert.equal(record.priceLines[0].options.price, 125);
    assert.equal(record.priceLines[0].options.title, 'level');

    chart.remove();
});

test('a note with a range becomes a region', () => {
    const { chart } = charted();

    chart.annotate([{ from: start + 20 * day, to: start + 30 * day, text: 'consolidation' }]);

    assert.equal(chart._internal.annotations.length, 1);

    chart.remove();
});

test('a note that says nothing useful is ignored rather than guessed at', () => {
    const { chart, record } = charted();

    chart.annotate([{ text: 'somewhere' }, {}]);

    assert.equal(record.markers.length, 0);
    assert.equal(record.priceLines.length, 0);
    assert.equal((chart._internal.annotations ?? []).length, 0);

    chart.remove();
});

/* ---------------------------------------------------------------- the drawing */

/** Every rectangle and string the chart paints. */
function painted(chart) {
    const fills = [];
    const texts = [];

    let fillStyle = null;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect: (x, y, width, height) => fills.push({ x, y, width, height, fillStyle }),
        fillText: (text, x, y) => texts.push({ text: String(text), x, y, fillStyle }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'fillStyle') {
                fillStyle = value;
            }

            return true;
        },
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return { fills, texts };
}

test('a region is painted across the times it names', () => {
    const { chart } = charted();

    chart.annotate([{ from: start + 10 * day, to: start + 20 * day, color: '#db2777' }]);

    const scale = chart._internal.timeScale;
    const band = painted(chart).fills.find((fill) => fill.fillStyle === 'rgba(219, 39, 119, 0.1)');

    assert.ok(band, 'the region was not painted');
    assert.ok(Math.abs(band.x - (scale.indexToX(10) - scale.barSpacing / 2)) < 1.5, 'it starts at the wrong time');
    assert.ok(Math.abs(band.width - (scale.indexToX(20) - scale.indexToX(10) + scale.barSpacing)) < 2);

    chart.remove();
});

test('one colour is enough: the fill is derived from it', () => {
    const { chart } = charted();

    chart.annotate([{ from: start + 5 * day, to: start + 8 * day, color: '#22ab94', text: 'here' }]);

    const drawn = painted(chart);

    // A model returning notes should not have to return two colours per note,
    // one of which is the other at ten per cent.
    assert.ok(drawn.fills.some((fill) => fill.fillStyle === 'rgba(34, 171, 148, 0.1)'));
    assert.ok(drawn.texts.some((text) => text.text === 'here' && text.fillStyle === '#22ab94'));

    chart.remove();
});

test('the label sits at the top, not over the readings it is about', () => {
    const { chart } = charted();

    chart.annotate([{ from: start + 5 * day, to: start + 8 * day, text: 'here' }]);

    const label = painted(chart).texts.find((text) => text.text === 'here');
    const plot = chart._internal.plot;

    assert.ok(label.y < plot.top + 20, `the label is at ${label.y}, down among the data`);

    chart.remove();
});

test('a region reversed in time is drawn the same as one the right way round', () => {
    const { chart } = charted();

    // A model will hand these back in either order, and a zero-width band is
    // an annotation nobody can see and nobody can explain.
    chart.annotate([{ from: start + 20 * day, to: start + 10 * day, color: '#db2777' }]);

    const band = painted(chart).fills.find((fill) => fill.fillStyle === 'rgba(219, 39, 119, 0.1)');

    assert.ok(band && band.width > 10, `the band came out ${band?.width} wide`);

    chart.remove();
});

test('a region is clipped to the plot, not drawn across the axes', () => {
    const { chart } = charted();

    chart.annotate([{ from: start, to: start + 39 * day, color: '#db2777' }]);

    // Clipped rather than clamped, so a band that starts off screen still
    // reaches the edge instead of stopping short of it.
    const plot = chart._internal.plot;
    const clip = painted(chart).fills.find((fill) => fill.fillStyle === 'rgba(219, 39, 119, 0.1)');

    assert.ok(clip.y >= plot.top - 0.01 && clip.y + clip.height <= plot.bottom + 0.01);

    chart.remove();
});

/* ----------------------------------------------------------------- the handle */

test('clearing takes back exactly what it drew', () => {
    const { chart, series, record } = charted();

    // Markers the page drew itself, before any model said anything.
    createSeriesMarkers(series, [
        { time: start + 2 * day, position: 'aboveBar', shape: 'arrowUp', text: 'mine' },
    ]);

    const notes = chart.annotate([
        { time: start + 10 * day, price: 110, text: 'theirs' },
        { price: 125, text: 'level' },
        { from: start + 20 * day, to: start + 30 * day },
    ]);

    assert.equal(record.markers.length, 2);

    notes.clear();

    // The page's own marker survives. Replacing rather than appending would
    // lose it the first time a model said anything.
    assert.equal(record.markers.length, 1);
    assert.equal(record.markers[0].text, 'mine');
    assert.equal(record.priceLines.length, 0);
    assert.equal(chart._internal.annotations.length, 0);

    chart.remove();
});

test('two sets of notes are independent', () => {
    const { chart, record } = charted();

    const first = chart.annotate([{ price: 110, text: 'one' }]);

    chart.annotate([{ price: 120, text: 'two' }]);

    first.clear();

    assert.equal(record.priceLines.length, 1);
    assert.equal(record.priceLines[0].options.title, 'two');

    chart.remove();
});

test('a chart with no series takes notes without throwing', () => {
    const chart = createChart(container(), { width: 800, height: 300 });

    const notes = chart.annotate([{ price: 100, text: 'nothing to hang this on' }]);

    notes.clear();
    chart.remove();
});

test('the series can be named when the chart carries several', () => {
    const chart = createChart(container(), { width: 800, height: 300 });
    const first = chart.addSeries(LineSeries, { title: 'A' });
    const second = chart.addSeries(LineSeries, { title: 'B' });

    first.setData(values());
    second.setData(values());
    chart._internal.render();

    chart.annotate([{ price: 110, text: 'on B' }], { series: second });

    assert.equal(chart._internal.allSeries[0].priceLines.length, 0);
    assert.equal(chart._internal.allSeries[1].priceLines.length, 1);

    chart.remove();
});
