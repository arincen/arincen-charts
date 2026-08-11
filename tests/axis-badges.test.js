import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';

/**
 * The shape of a price badge, and where its point aims.
 *
 * A rectangle says the number belongs to the axis. A point on the plot-facing
 * edge says it belongs to *that level*, which is the question a reader has
 * when two badges sit near each other and one of them is the live price.
 *
 * Tested through the canvas rather than by reading the drawing code, because
 * the thing worth protecting is the geometry that reaches the screen: a point
 * that aims a few pixels off the line it names looks like a bug even though
 * every number behind it is right.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count, at = (index) => 100 + index) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: at(index),
}));

/**
 * Draws the chart and returns every closed path the badge painter laid down,
 * as a list of points.
 *
 * @returns {{ paths: {x: number, y: number}[][], rects: number[][] }}
 */
function shapesDrawn(chart, place) {
    const paths = [];
    const rects = [];

    let current = null;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        beginPath: () => { current = { points: [], curves: [] }; },
        moveTo: (x, y) => current?.points.push({ x, y }),
        lineTo: (x, y) => current?.points.push({ x, y }),
        quadraticCurveTo: (cx, cy, x, y) => {
            current?.points.push({ x, y });

            // The control point matters: a corner drawn with radius zero still
            // issues a curve, with its control and end point on top of each other.
            // Counting calls said "rounded"; only the distance says it.
            current?.curves.push(Math.hypot(x - cx, y - cy));
        },
        closePath: () => {},
        fill: () => { if (current?.points.length) { paths.push(current); current = null; } },
        fillRect: (x, y, width, height) => rects.push([x, y, width, height]),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;

    if (place) {
        place();
    } else {
        chart._internal.render();
    }

    return { paths, rects };
}

/**
 * Badges are the paths drawn in the axis strip.
 *
 * Identified by where they are rather than by how many vertices they have.
 * Counting vertices happened to keep working when the corners were rounded —
 * the curves are two more segments but only two more end points — so the test
 * went on passing while no longer seeing the shape it was checking.
 *
 * @param {{points: {x: number, y: number}[], curves: number}[]} paths
 * @param {number} axisLeft
 */
const badges = (paths, axisLeft) => paths.filter(
    (path) => path.points.length >= 5 && path.points.every((point) => point.x >= axisLeft - 1),
);

test('a price badge is a pointed tag, not a rectangle', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(LineSeries, {}).setData(points(40));

    const { paths } = shapesDrawn(chart);
    const drawn = badges(paths, chart._internal.plot.right);

    assert.ok(drawn.length >= 1, 'no badge was drawn in the axis strip');

    for (const path of drawn) {
        const tip = path.points[0];
        const shoulders = [path.points[1], path.points.at(-1)];

        const rounded = path.curves.filter((radius) => radius >= 1);

        assert.ok(
            rounded.length >= 2,
            `the badge has ${rounded.length} genuinely rounded corners `
                + `(radii ${path.curves.map((r) => r.toFixed(1)).join(', ')}); expected at least two`,
        );

        // A five-sided path is not enough on its own: a rectangle with the
        // point set flush against its own edge has five vertices too, and
        // looks exactly like the shape this replaced.
        assert.ok(
            shoulders.every((corner) => Math.abs(corner.x - tip.x) >= 3),
            `the point is flat — its shoulders are ${shoulders.map((c) => c.x).join(', ')} against a tip at ${tip.x}`,
        );
    }

    chart.remove();
});

test('the point tracks the level rather than sitting at the badge centre', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    // The scale is told to keep no headroom, so the highest price lands on the
    // top edge of the plot and its badge has to be nudged down to stay whole.
    // Only then do the badge's centre and the level it names come apart: on any
    // badge that was not nudged they are the same pixel, and a test using one
    // of those cannot tell a tracking point from a centred one — it would have
    // passed before this change existed.
    chart.applyOptions({ rightPriceScale: { scaleMargins: { top: 0, bottom: 0 } } });
    chart.addSeries(LineSeries, {}).setData(points(40, (index) => (index === 39 ? 400 : 100)));

    const { paths } = shapesDrawn(chart);
    const drawn = badges(paths, chart._internal.plot.right);

    assert.ok(drawn.length >= 1, 'no badge to check');

    for (const path of drawn) {
        const tip = path.points[0];
        const ys = path.points.slice(1).map((corner) => corner.y);
        const centre = (Math.min(...ys) + Math.max(...ys)) / 2;

        assert.ok(
            tip.y < centre - 0.5,
            `the point sits at ${tip.y} against a centre of ${centre} — it is not aiming upward at the price`,
        );
    }

    chart.remove();
});

test('the tip is on the edge facing the plot', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(LineSeries, {}).setData(points(40));

    const { paths } = shapesDrawn(chart);
    const plot = chart._internal.plot;

    for (const path of badges(paths, plot.right)) {
        const tip = path.points[0];
        const corners = path.points.slice(1);

        // Right-hand axis: every corner sits at or right of the tip, so the
        // point is the leftmost thing in the shape.
        assert.ok(
            corners.every((corner) => corner.x >= tip.x - 0.01),
            `the tip at x=${tip.x} is not the plot-facing edge`,
        );
        assert.ok(tip.x >= plot.right - 1, `the badge is drawn inside the plot, at x=${tip.x}`);
    }

    chart.remove();
});

test('a badge pushed off the edge keeps its point inside itself', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    // As above: no headroom, so the last value sits on the very top edge and
    // its badge is pushed inward. A point that stayed level with the price
    // would then sit outside the shape it belongs to.
    chart.applyOptions({ rightPriceScale: { scaleMargins: { top: 0, bottom: 0 } } });
    chart.addSeries(LineSeries, {}).setData(points(40, (index) => (index === 39 ? 400 : 100)));

    const { paths } = shapesDrawn(chart);

    for (const path of badges(paths, chart._internal.plot.right)) {
        const tip = path.points[0];
        const ys = path.points.slice(1).map((corner) => corner.y);

        assert.ok(
            tip.y >= Math.min(...ys) - 0.01 && tip.y <= Math.max(...ys) + 0.01,
            `the point at y=${tip.y} escaped a badge spanning ${Math.min(...ys)}–${Math.max(...ys)}`,
        );
    }

    chart.remove();
});

/* ------------------------------------------------------------- time badge */

/** The crosshair's date label, drawn below the plot. */
const timeBadges = (paths, plotBottom) => paths.filter(
    (path) => path.points.length >= 7 && path.points.every((point) => point.y >= plotBottom),
);

test('the time badge is rounded on all four corners and points at the bar', () => {
    const chart = createChart(container(), { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries, {});

    series.setData(points(40));
    chart._internal.render();

    const { paths } = shapesDrawn(chart, () => {
        chart.setCrosshairPosition(120, start + 20 * day, series);
    });

    const drawn = timeBadges(paths, chart._internal.plot.bottom);

    assert.equal(drawn.length, 1, 'expected exactly one time badge');

    const [badge] = drawn;
    const rounded = badge.curves.filter((radius) => radius >= 1);

    assert.equal(rounded.length, 4, `expected four rounded corners, got ${rounded.length}`);

    // The tip is the highest point — the edge facing the plot — and it is
    // alone up there; its shoulders sit a notch below it.
    const tip = badge.points.reduce((highest, point) => (point.y < highest.y ? point : highest));
    const others = badge.points.filter((point) => point !== tip);

    assert.ok(
        others.every((point) => point.y > tip.y + 1),
        'the point is level with the badge edge rather than rising above it',
    );
});

test('the time badge points at the crosshair, not at its own centre', () => {
    const chart = createChart(container(), { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries, {});

    series.setData(points(40));

    // Fitted, so the first bar really is at the left edge. Without this the
    // chart shows its default window and bar zero lands comfortably inside it,
    // where nothing is clamped and a centred point is indistinguishable from a
    // tracking one — the same trap the price badge test fell into.
    chart.timeScale().fitContent();
    chart._internal.render();

    // The first bar: the label has to slide right to stay on screen, so its
    // centre and the column it names come apart.
    const { paths } = shapesDrawn(chart, () => {
        chart.setCrosshairPosition(120, start, series);
    });

    const [badge] = timeBadges(paths, chart._internal.plot.bottom);
    const tip = badge.points.reduce((highest, point) => (point.y < highest.y ? point : highest));
    const xs = badge.points.map((point) => point.x);
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2;

    assert.ok(
        tip.x < centre - 1,
        `the point sits at ${tip.x} against a centre of ${centre} — it is not aiming at the first bar`,
    );
});
