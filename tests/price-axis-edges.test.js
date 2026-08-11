import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, AreaSeries } from '../src/index.js';

/**
 * Price labels at the very edge of the canvas.
 *
 * A label is centred on its tick, so one sitting exactly on the top edge is
 * drawn half above the canvas and arrives as a row of clipped glyphs. It shows
 * up on any chart whose time axis is hidden — the cards on our own landing page
 * — where the plot runs to the bottom of the element and the top tick can land
 * on the first pixel.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

/**
 * Ending on a round number is the whole arrangement. Ticks are chosen at nice
 * values, so a range topping out at 140 puts one exactly on the edge, and 139
 * puts none there — which is why a first attempt at this test passed against
 * the defect it was written for.
 */
const points = Array.from({ length: 41 }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

/** Every string the axis painted, with where it was painted. */
function axisLabels(chart) {
    const written = [];

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillText: (text, x, y) => written.push({ text, x, y }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    // The right-hand gutter only: the plot's own text is somebody else's test.
    return written.filter((entry) => entry.x >= chart._internal.plot.right);
}

/**
 * Margins of zero put a tick on the first and last pixel, which is the
 * arrangement that used to clip. Nothing here asks for a tick to be dropped —
 * only that whatever is drawn is drawn where it can be read.
 */
function built() {
    const chart = createChart(container(), {
        width: 400,
        height: 240,
        layout: { fontSize: 10 },
        rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0, bottom: 0 } },
        timeScale: { visible: false },
    });

    chart.addSeries(AreaSeries, {}).setData(points);
    chart.timeScale().fitContent();

    return chart;
}

test('no price label is drawn half off the top of the canvas', () => {
    const chart = built();
    const labels = axisLabels(chart);

    assert.ok(labels.length, 'the axis drew nothing at all');

    for (const label of labels) {
        assert.ok(
            label.y >= 5,
            `"${label.text}" was drawn at y=${label.y}, with half its glyphs above the canvas`,
        );
    }

    chart.remove();
});

test('nor half off the bottom', () => {
    const chart = built();

    // The labels first: the plot has no measurements until something renders,
    // and reading it before that compares every label against zero.
    const labels = axisLabels(chart);
    const bottom = chart._internal.plot.bottom;

    for (const label of labels) {
        assert.ok(
            label.y <= bottom - 5,
            `"${label.text}" was drawn at y=${label.y}, below a plot ending at ${bottom}`,
        );
    }

    chart.remove();
});
