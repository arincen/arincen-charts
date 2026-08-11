import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries, LineStyle } from '../src/index.js';

/**
 * The crosshair is drawn over a halo of itself.
 *
 * One hairline cannot be both dark enough to survive a white candle and light
 * enough to leave a dark one intact. Picking the darker colour — which is what
 * a single stroke forces — loses the line over a filled body, which is the
 * moment a reader most wants to see it, because that is where the price they
 * are reading came from.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + Math.sin(index / 4) * 8,
}));

/**
 * Every stroke the overlay lays down while the crosshair is up.
 *
 * @returns {{width: number, alpha: number, dashed: boolean}[]}
 */
function overlayStrokes(chart) {
    const strokes = [];

    // `save` and `restore` are modelled rather than ignored. The halo sets a
    // low alpha inside a save/restore pair; a recorder that drops the restore
    // leaves every later stroke looking like a halo, which is how this test
    // first reported six of them on a chart that draws two.
    let state = { lineWidth: 1, globalAlpha: 1, dash: [] };
    const stack = [];

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        setLineDash: (pattern) => { state.dash = pattern ?? []; },
        save: () => { stack.push({ ...state }); },
        restore: () => { state = stack.pop() ?? state; },
        stroke: () => strokes.push({
            width: state.lineWidth,
            alpha: state.globalAlpha,
            dashed: state.dash.length > 0,
        }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'lineWidth' || key === 'globalAlpha') {
                state[key] = value;
            }

            return true;
        },
    });

    chart._internal.overlayCtx = recording;

    // Placed through the public path rather than by assigning the internal
    // shape: `setCrosshair` derives `y` from the price scale and stores an `x`
    // alongside, and a hand-built object that happens to miss one of those
    // draws nothing while looking like it should.
    // `setCrosshairPosition` draws as part of placing it. Calling the painter
    // again afterwards recorded every stroke twice, which is why the counts
    // below are exact rather than "at least": a doubled reading passed a
    // `>= 2` assertion while proving nothing.
    chart.setCrosshairPosition(100, start + 20 * day, chart._internal.allSeries[0].api);

    return strokes;
}

test('the crosshair draws a wider, fainter line beneath itself', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(LineSeries, {}).setData(points(60));
    chart._internal.render();

    const strokes = overlayStrokes(chart);
    const halos = strokes.filter((stroke) => stroke.alpha < 1);

    assert.equal(halos.length, 2, 'expected exactly one halo behind each of the two lines');

    for (const halo of halos) {
        assert.ok(halo.width > 1, `a halo of width ${halo.width} is not wider than the line it is behind`);
        assert.ok(halo.alpha <= 0.3, `a halo at alpha ${halo.alpha} would read as a second line`);
    }

    chart.remove();
});

test('the halo is solid even when the line is not', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(LineSeries, {}).setData(points(60));
    chart._internal.render();

    // A dashed halo is a second dashed line, and the gaps are precisely where
    // the line was disappearing in the first place.
    for (const halo of overlayStrokes(chart).filter((stroke) => stroke.alpha < 1)) {
        assert.equal(halo.dashed, false, 'the halo was drawn with the line’s dash pattern');
    }

    chart.remove();
});

test('the line itself is still a hairline at full strength', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(LineSeries, {}).setData(points(60));
    chart._internal.render();

    const solid = overlayStrokes(chart).filter((stroke) => stroke.alpha === 1 && stroke.width === 1);

    assert.equal(solid.length, 2, 'expected exactly two hairlines at full strength');

    chart.remove();
});

test('a hidden crosshair line draws neither a line nor a halo', () => {
    const chart = createChart(container(), {
        width: 600,
        height: 300,
        crosshair: { vertLine: { visible: false } },
    });

    chart.addSeries(LineSeries, {}).setData(points(60));
    chart._internal.render();

    const strokes = overlayStrokes(chart);

    // One line and one halo, not two of each.
    assert.ok(
        strokes.filter((stroke) => stroke.alpha < 1).length === 1,
        `hiding one line left ${strokes.filter((s) => s.alpha < 1).length} halos`,
    );

    chart.remove();
});

test('the crosshair is dotted by default', () => {
    const chart = createChart(container(), { width: 600, height: 300 });

    assert.equal(chart.options().crosshair.vertLine.style, LineStyle.Dotted);
    assert.equal(chart.options().crosshair.horzLine.style, LineStyle.Dotted);

    chart.remove();
});
