import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, AreaSeries, LineSeries } from '../src/index.js';

/**
 * The fill carried into the axis strips.
 *
 * A chart's fill stops dead at the gutter, so it reads as a coloured middle
 * with two grey strips bolted either side. Continuing it makes the whole thing
 * one object — and the gutters are somewhere nobody else has coloured.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

/**
 * Every rectangle painted outside the plot with a gradient.
 *
 * Identified by the gradient rather than by a faint alpha. The tint used to be
 * washed over the strips at 55%, which is what made it a near-match instead of
 * a continuation — a seam along the edge draws the eye to exactly the place the
 * effect was meant to disappear. There is no extra alpha now, so a test looking
 * for one finds nothing.
 */
function stripFills(chart) {
    const fills = [];

    let style = null;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => {
            const stops = [];

            return { gradient: true, stops, addColorStop: (at, colour) => stops.push({ at, colour }) };
        },
        fillRect: (x, y, width, height) => fills.push({ x, y, width, height, style }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'fillStyle') {
                style = value;
            }

            return true;
        },
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    const plot = chart._internal.plot;

    return fills.filter(
        (fill) => fill.style?.gradient && (fill.x >= plot.right - 1 || fill.y >= plot.bottom - 1),
    );
}

function chartWith(options) {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(AreaSeries, {
        topColor: 'rgba(192, 38, 211, 0.34)',
        bottomColor: 'rgba(234, 88, 12, 0.03)',
        ...options,
    }).setData(points(40));

    chart._internal.render();

    return chart;
}

test('nothing reaches the gutters unless asked', () => {
    const chart = chartWith({});

    assert.deepEqual(stripFills(chart), [], 'an axis was tinted without being asked');

    chart.remove();
});

test('the fill reaches both strips when asked', () => {
    const chart = chartWith({ tintAxes: true });
    const plot = chart._internal.plot;
    const tinted = stripFills(chart);

    assert.ok(
        tinted.some((fill) => fill.x >= plot.right - 1),
        'the price strip was left grey',
    );
    assert.ok(
        tinted.some((fill) => fill.y >= plot.bottom - 1),
        'the time strip was left grey',
    );

    chart.remove();
});

test('the price strip starts at the last reading, not at the top', () => {
    const chart = chartWith({ tintAxes: true });
    const plot = chart._internal.plot;
    const series = chart._internal.allSeries[0];
    const last = series.points[series.points.length - 1];
    const edge = series.scale.priceScale.priceToY(last.value);

    const priceStrip = stripFills(chart).find((fill) => fill.x >= plot.right - 1);

    assert.ok(priceStrip, 'the price strip was not tinted');

    // The dress reaches the gutter at the height of the last reading. Filling
    // from the top paints colour above the line, which the fill itself never
    // does — so the two stop being the same shape.
    assert.ok(
        Math.abs(priceStrip.y - edge) < 1.5,
        `the strip starts at ${priceStrip.y}, not at the last reading's ${edge.toFixed(1)}`,
    );
    assert.ok(
        priceStrip.y > plot.top + 2,
        'the strip starts at the top of the plot, so it is not following the fill at all',
    );

    chart.remove();
});

test('the strips carry the fill gradient, not a flat approximation', () => {
    const chart = chartWith({ tintAxes: true });

    // A flat colour beside a gradient is a near-match, and the seam is on the
    // one edge the effect exists to remove.
    for (const fill of stripFills(chart)) {
        assert.ok(fill.style.gradient, 'a strip was painted with a flat colour');
        assert.ok(fill.style.stops.length >= 2, 'the gradient has nothing to interpolate');
    }

    chart.remove();
});

test('a series with no readings does not tint', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(AreaSeries, { tintAxes: true, topColor: 'rgba(192, 38, 211, 0.34)' }).setData([]);
    chart._internal.render();

    // An empty chart already says it is empty. Colouring its gutters from a
    // series that has drawn nothing claims the chart is about something.
    assert.deepEqual(stripFills(chart), [], 'an empty chart tinted its axes');

    chart.remove();
});

test('a hidden series does not tint', () => {
    const chart = chartWith({ tintAxes: true, visible: false });

    assert.deepEqual(stripFills(chart), [], 'a series nobody can see coloured the axes');

    chart.remove();
});

test('only one series tints, and it is the first that asks', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    const first = chart.addSeries(AreaSeries, {
        tintAxes: true,
        topColor: 'rgba(192, 38, 211, 0.34)',
    });

    const second = chart.addSeries(AreaSeries, {
        tintAxes: true,
        topColor: 'rgba(0, 255, 0, 0.34)',
    });

    first.setData(points(40));
    second.setData(points(40));
    chart._internal.render();

    const plot = chart._internal.plot;
    const priceStrip = stripFills(chart).filter((fill) => fill.x >= plot.right - 1);

    // Two washes over one strip is mud. One answer, and one a caller can
    // predict from the order they added their series.
    assert.equal(priceStrip.length, 1, `the price strip was painted ${priceStrip.length} times`);

    // And it is the *first*, which counting alone cannot tell: reversing the
    // search still paints one strip, with the wrong series' colour. The time
    // strip is a flat fill, so its style is the colour itself.
    const timeStrip = stripFills(chart).filter((fill) => fill.y >= plot.bottom - 1);

    assert.equal(
        timeStrip[0]?.style?.stops?.[0]?.colour,
        'rgba(192, 38, 211, 0.34)',
        `the axes took their colour from the wrong series: ${timeStrip[0]?.style?.stops?.[0]?.colour}`,
    );

    chart.remove();
});

test('a series without a fill has nothing to lend', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(LineSeries, { tintAxes: true }).setData(points(40));
    chart._internal.render();

    assert.deepEqual(stripFills(chart), [], 'a line series with no fill tinted the axes anyway');

    chart.remove();
});

test('the corner where the two strips meet is not left white', () => {
    const chart = chartWith({ tintAxes: true });
    const plot = chart._internal.plot;
    const width = chart._internal.width;

    const bottom = stripFills(chart).find((fill) => fill.y >= plot.bottom - 1);

    assert.ok(bottom, 'the time strip was not tinted');

    // The square below the price axis is the one right angle on the chart, so
    // an unpainted notch there is more noticeable than either strip.
    assert.ok(
        bottom.x + bottom.width >= width - 1,
        `the bottom strip stops at ${bottom.x + bottom.width} of ${width}, leaving the corner bare`,
    );

    chart.remove();
});

test('the axis border is not drawn across the tint', () => {
    const lines = (options) => {
        const chart = chartWith(options);
        const plot = chart._internal.plot;
        const drawn = [];

        let path = [];

        const recording = new Proxy({
            measureText: (text) => ({ width: String(text).length * 7 }),
            createLinearGradient: () => ({ gradient: true, addColorStop() {} }),
            beginPath: () => { path = []; },
            moveTo: (x, y) => path.push({ x, y }),
            lineTo: (x, y) => path.push({ x, y }),
            stroke: () => { drawn.push(path); path = []; },
        }, {
            get: (target, key) => (key in target ? target[key] : () => {}),
            set: () => true,
        });

        chart._internal.mainCtx = recording;
        chart._internal.overlayCtx = recording;
        chart._internal.render();

        // A vertical line sitting on the boundary between plot and gutter.
        const border = drawn.filter(
            (line) => line.length === 2
                && Math.abs(line[0].x - line[1].x) < 0.01
                && Math.abs(line[0].x - plot.right) < 1.5,
        );

        chart.remove();

        return border.length;
    };

    // The border marks the boundary between plot and gutter, and the tint says
    // there isn't one. A pale line down the middle of a continuous colour is
    // the seam the effect removes, put back a pixel wide.
    assert.ok(lines({}) > 0, 'an untinted chart lost its axis border');
    assert.equal(lines({ tintAxes: true }), 0, 'the border was drawn straight through the tint');
});
