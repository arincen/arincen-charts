import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';

/**
 * A chart whose price axis is on the left.
 *
 * The time scale measured from the canvas edge rather than from the plot, which
 * is the same thing whenever the axis is on the right — and every chart anyone
 * had drawn put it on the right. With the axis on the left the plot begins
 * partway across, so every bar was drawn that far too far left: the start of
 * the series clipped away by the plot's own clip, the rest of it out of step
 * with the crosshair that reads it back.
 *
 * Found by asking what a right-to-left layout should do, which is a different
 * question with an unrelated answer.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

function leftScaled() {
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: true },
    });

    const series = chart.addSeries(LineSeries, { priceScaleId: 'left' });

    series.setData(points(40));
    chart.timeScale().fitContent();
    chart._internal.render();

    return { chart, series };
}

test('the axis takes room on the left', () => {
    const { chart } = leftScaled();

    assert.ok(chart._internal.plot.left > 0, 'the left axis was given no room');

    chart.remove();
});

test('no bar is drawn on top of the axis', () => {
    const { chart } = leftScaled();
    const scale = chart._internal.timeScale;
    const plot = chart._internal.plot;

    assert.ok(
        scale.indexToX(0) >= plot.left,
        `the first bar is at ${scale.indexToX(0).toFixed(1)}, left of the plot's ${plot.left}`,
    );
    assert.ok(
        scale.indexToX(39) <= plot.right,
        `the last bar is at ${scale.indexToX(39).toFixed(1)}, right of the plot's ${plot.right}`,
    );

    chart.remove();
});

test('a coordinate read back gives the bar it was taken from', () => {
    const { chart } = leftScaled();
    const scale = chart._internal.timeScale;

    // The crosshair converts the other way. Out by the axis width, it reports
    // a different bar from the one under the pointer — which is the failure
    // this bug produced and which no drawing test would have caught.
    for (const index of [0, 12, 39]) {
        const back = scale.xToIndex(scale.indexToX(index));

        assert.ok(Math.abs(back - index) < 0.01, `bar ${index} came back as ${back.toFixed(2)}`);
    }

    chart.remove();
});

test('the visible range covers the plot, not the canvas', () => {
    const { chart } = leftScaled();
    const { from, to } = chart.timeScale().getVisibleLogicalRange();

    assert.ok(from <= 0.01, `the range starts at ${from}, so the first bars are reported off screen`);
    assert.ok(to >= 38.99, `the range ends at ${to}, so the last bars are reported off screen`);

    chart.remove();
});

test('a right-hand axis is unaffected', () => {
    const chart = createChart(container(), { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries, {});

    series.setData(points(40));
    chart.timeScale().fitContent();
    chart._internal.render();

    const scale = chart._internal.timeScale;

    assert.equal(chart._internal.plot.left, 0);
    assert.ok(scale.indexToX(0) >= 0 && scale.indexToX(39) <= chart._internal.plot.right);

    chart.remove();
});

test('time still runs left to right with the axis on the left', () => {
    const { chart } = leftScaled();
    const scale = chart._internal.timeScale;

    // Moving the axis is a layout choice. The direction of a time series is
    // not, and it does not follow the axis across.
    assert.ok(
        scale.indexToX(0) < scale.indexToX(39),
        'the time scale reversed itself because the price axis moved',
    );

    chart.remove();
});

/* ------------------------------------------------------------- the crosshair */

/** Every string the overlay paints while the pointer is on the chart. */
function crosshairText(chart, clientY) {
    const drawn = [];

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillText: (text, x, y) => drawn.push({ text: String(text), y }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    });

    chart._internal.overlayCtx = recording;
    chart._internal.handlePointerMove({ clientX: 300, clientY });

    return drawn;
}

test('the crosshair reports a price from the scale the series is on', () => {
    const { chart } = leftScaled();

    const prices = crosshairText(chart, 140)
        .map((entry) => Number(entry.text))
        .filter((value) => Number.isFinite(value));

    assert.ok(prices.length, 'the crosshair printed no price at all');

    // The magnet found its price using each series' own scale and then had it
    // converted back through the pane's — the same scale only while everything
    // is on the right-hand axis. On the left it reported 4702 on a chart that
    // runs from 100 to 139.
    for (const price of prices) {
        assert.ok(
            price >= 95 && price <= 145,
            `the crosshair reported ${price} on a chart that runs 100 to 139`,
        );
    }

    chart.remove();
});

test('the badge is drawn at the height it names', () => {
    const { chart } = leftScaled();
    const pane = chart._internal.panes[0];
    const scale = [...pane.extraScales.values()][0].priceScale;

    const badge = crosshairText(chart, 140).find((entry) => Number.isFinite(Number(entry.text)));

    assert.ok(badge, 'no price badge was painted');

    // Snapped, so not exactly the pointer — but the number and the height it
    // is drawn at have to agree, which is what came apart.
    assert.ok(
        Math.abs(scale.priceToY(Number(badge.text)) - badge.y) < 12,
        `the badge says ${badge.text}, which belongs at `
            + `${scale.priceToY(Number(badge.text)).toFixed(0)}, but it was drawn at ${badge.y.toFixed(0)}`,
    );

    chart.remove();
});
