import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries, createSeriesMarkers } from '../src/full.js';

/**
 * Two pieces of drawing with no option behind them.
 *
 * Both are design rather than configuration, which is exactly the kind of
 * change the documentation guards cannot see: they check that every *name* is
 * written down and demonstrated, and neither of these has a name. Rounded
 * candles and pointed badges went undocumented for days for the same reason.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

/** Every arc and stroke the chart draws, with the style in force. */
function drawing(chart) {
    const arcs = [];
    const strokes = [];

    let fillStyle = null;
    let strokeStyle = null;
    let lineWidth = null;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        arc: (x, y, radius) => arcs.push({ x, y, radius, fillStyle }),
        stroke: () => strokes.push({ strokeStyle, lineWidth }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'fillStyle') {
                fillStyle = value;
            }

            if (key === 'strokeStyle') {
                strokeStyle = value;
            }

            if (key === 'lineWidth') {
                lineWidth = value;
            }

            return true;
        },
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return { arcs, strokes };
}

/* ------------------------------------------------------------- grip dots */

function twoPanes(options = {}) {
    const chart = createChart(container(), { width: 600, height: 400, ...options });

    chart.addSeries(LineSeries, {}).setData(points(40));
    chart.addSeries(LineSeries, {}, 1).setData(points(40));
    chart._internal.render();

    return chart;
}

/** Arcs sitting on the divider between the two panes. */
function gripDots(chart) {
    const separator = chart._internal.panes[0].plot.bottom;

    return drawing(chart).arcs.filter((arc) => Math.abs(arc.y - separator) < 2 && arc.radius < 4);
}

test('a draggable divider shows its grip', () => {
    const chart = twoPanes();

    // A one-pixel line is the whole affordance otherwise, and a border is not
    // something anybody tries to drag.
    assert.equal(gripDots(chart).length, 3, 'the divider has no grip on it');

    chart.remove();
});

test('the dots sit in the middle of the plot', () => {
    const chart = twoPanes();
    const plot = chart._internal.plot;
    const middle = (plot.left + plot.right) / 2;
    const dots = gripDots(chart);

    const centre = dots.reduce((total, dot) => total + dot.x, 0) / dots.length;

    assert.ok(Math.abs(centre - middle) < 1, `the grip is centred at ${centre}, not ${middle}`);

    // Spread out, not stacked: three arcs at one point is a dot, not a grip.
    assert.ok(Math.max(...dots.map((dot) => dot.x)) - Math.min(...dots.map((dot) => dot.x)) > 5);

    chart.remove();
});

test('a divider nobody can drag does not advertise a handle', () => {
    const chart = twoPanes({ layout: { panes: { enableResize: false } } });

    assert.deepEqual(gripDots(chart), [], 'a fixed divider offered a grip');

    chart.remove();
});

test('a single-pane chart draws no divider at all', () => {
    const chart = createChart(container(), { width: 600, height: 400 });

    chart.addSeries(LineSeries, {}).setData(points(40));

    const separator = chart._internal.panes[0].plot.bottom;

    assert.deepEqual(
        drawing(chart).arcs.filter((arc) => Math.abs(arc.y - separator) < 2 && arc.radius < 4),
        [],
    );

    chart.remove();
});

/* -------------------------------------------------------- outlined markers */

function marked({ textColor = '#0a0a0a', ...background }) {
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        layout: { background, textColor },
    });

    const series = chart.addSeries(LineSeries, {});

    series.setData(points(40));
    createSeriesMarkers(series, [
        { time: start + 10 * day, position: 'aboveBar', shape: 'arrowDown', color: '#f23645', text: 'sell' },
    ]);

    chart.timeScale().fitContent();

    return chart;
}

test('a marker is outlined in the chart background', () => {
    const chart = marked({ type: 'solid', color: '#ffffff' });

    // The marker sits on top of the bars it points at, and a red arrow over a
    // red candle is a shape nobody can find.
    assert.ok(
        drawing(chart).strokes.some((stroke) => stroke.strokeStyle === '#ffffff' && stroke.lineWidth >= 1.5),
        'the marker was drawn with no separation from what is behind it',
    );

    chart.remove();
});

test('a dark chart outlines in its own dark background', () => {
    const chart = marked({ type: 'solid', color: '#131722' });

    // Not white: an outline is separation from the page, not a highlight, and
    // a white ring on a dark chart is a second marker.
    assert.ok(drawing(chart).strokes.some((stroke) => stroke.strokeStyle === '#131722'));

    chart.remove();
});

test('a transparent chart never strokes with transparent', () => {
    const chart = marked({ type: 'solid', color: 'transparent', textColor: '#0a0a0a' });

    assert.equal(
        drawing(chart).strokes.some((stroke) => stroke.strokeStyle === 'transparent'),
        false,
        'the outline was drawn in nothing at all',
    );

    chart.remove();
});

/**
 * Transparent is the *common* case, not the edge one: it is what this site's
 * charts use, what the documentation demos use, and what anybody dropping a
 * chart onto a styled page uses. Skipping the ring there — which is what the
 * first version of this did — means the feature never appears anywhere it
 * matters, and nothing in the suite would have said so.
 */
test('a transparent chart on a light page rings in white', () => {
    const chart = marked({ type: 'solid', color: 'transparent', textColor: '#67676c' });

    assert.ok(
        drawing(chart).strokes.some((stroke) => stroke.strokeStyle === '#ffffff'),
        'a marker on a light page got no ring',
    );

    chart.remove();
});

test('a transparent chart on a dark page rings in dark', () => {
    const chart = marked({ type: 'solid', color: 'transparent', textColor: '#98989f' });

    // Read from the text colour, because pale text is only ever set on a dark
    // page. A white ring there would be a second marker.
    assert.ok(
        drawing(chart).strokes.some((stroke) => stroke.strokeStyle === '#0a0a0a'),
        'a marker on a dark page got a light ring or none',
    );

    chart.remove();
});

test('a nearly-transparent background is not treated as cover', () => {
    const chart = marked({ type: 'solid', color: 'rgba(255, 255, 255, 0.2)', textColor: '#0a0a0a' });

    // A wash that thin does not hide a candle, so a ring drawn in it is not
    // separation — it is a faint smear the same shape as the marker.
    assert.equal(
        drawing(chart).strokes.some((stroke) => stroke.strokeStyle === 'rgba(255, 255, 255, 0.2)'),
        false,
    );

    chart.remove();
});
