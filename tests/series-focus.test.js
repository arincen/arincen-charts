import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';
import { seriesUnderPointer } from '../src/chart.js';

/**
 * The series under the pointer keeps its colour; the rest fade back.
 *
 * A chart carrying four lines is asking the reader to follow one of them, and
 * nothing else on the chart says which. Fading is the cheapest way to answer
 * that without hiding anything — the faded lines are still readable, still hit
 * tested, still in the crosshair's data.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count, offset = 0) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + offset,
}));

/** Renders and reports the alpha each series was drawn at. */
function alphas(chart) {
    const drawn = [];

    let alpha = 1;
    const stack = [];

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        save: () => stack.push(alpha),
        restore: () => { alpha = stack.pop() ?? alpha; },
        stroke: () => drawn.push(alpha),
        fill: () => drawn.push(alpha),
        fillRect: () => drawn.push(alpha),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'globalAlpha') {
                alpha = value;
            }

            return true;
        },
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return drawn;
}

function chartWithLines(count) {
    const chart = createChart(container(), { width: 600, height: 300 });

    for (let index = 0; index < count; index++) {
        chart.addSeries(LineSeries, { priceLineVisible: false, lastValueVisible: false })
            .setData(points(30, index * 20));
    }

    chart._internal.render();

    return chart;
}

test('nothing is faded until the pointer is near a series', () => {
    const chart = chartWithLines(3);

    assert.ok(alphas(chart).every((value) => value === 1), 'a series was faded with no pointer on the chart');

    chart.remove();
});

test('the others fade once one series has the pointer', () => {
    const chart = chartWithLines(3);
    const pane = chart._internal.panes[0];
    const target = pane.series[1];

    chart._internal.focusedSeries = target;

    const faded = alphas(chart).filter((value) => value < 1);

    assert.ok(faded.length > 0, 'nothing faded while a series held the pointer');
    assert.ok(faded.every((value) => value > 0), 'a series was faded all the way out');

    chart.remove();
});

test('a chart with one series never fades it', () => {
    const chart = chartWithLines(1);

    chart._internal.focusedSeries = chart._internal.panes[0].series[0];

    assert.ok(
        alphas(chart).every((value) => value === 1),
        'the only series on the chart was faded, which can only make it harder to read',
    );

    chart.remove();
});

test('the fade is released when the pointer leaves', () => {
    const chart = chartWithLines(3);

    chart._internal.focusedSeries = chart._internal.panes[0].series[0];
    chart._internal.handlePointerLeave();

    assert.equal(
        chart._internal.focusedSeries,
        null,
        'the chart stays dimmed after the pointer has gone',
    );

    chart.remove();
});

/* --------------------------------------------------------- what is nearest */

test('the nearest series wins, not the first one drawn', () => {
    const chart = chartWithLines(3);
    const pane = chart._internal.panes[0];
    const scale = pane.series[2].scale.priceScale;

    // Aimed squarely at the third series. The crosshair event reports the
    // first series holding a reading at this index, which is a fair answer to
    // a different question and the wrong one here.
    const y = scale.priceToY(140);

    assert.equal(seriesUnderPointer(pane, 5, y, 14), pane.series[2]);

    chart.remove();
});

test('a pointer near nothing claims nothing', () => {
    const chart = chartWithLines(3);
    const pane = chart._internal.panes[0];

    assert.equal(seriesUnderPointer(pane, 5, pane.plot.top + 1, 4), null);

    chart.remove();
});

test('a hidden series cannot take the pointer', () => {
    const chart = chartWithLines(3);
    const pane = chart._internal.panes[0];
    const scale = pane.series[2].scale.priceScale;

    pane.series[2].options.visible = false;

    assert.notEqual(
        seriesUnderPointer(pane, 5, scale.priceToY(140), 14),
        pane.series[2],
        'a series nobody can see was brought forward',
    );

    chart.remove();
});
