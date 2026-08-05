import test from 'node:test';
import assert from 'node:assert/strict';
import { CandlestickSeries } from '../src/series.js';

/**
 * A canvas that records rectangles instead of painting them.
 *
 * Testing the geometry through the real `draw` rather than through the width
 * helper is deliberate: the bug that shipped was not in the width at all. The
 * body was the right size and the border was stroked *around* it, which no
 * test of the width function would ever have noticed.
 */
function recordingContext(pixelRatio) {
    const rects = [];

    return {
        rects,
        fillStyle: '',
        set lineWidth(value) {},
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        strokeRect(x, y, width, height) {
            rects.push({ x, y, width, height, stroked: true });
        },
        fillRect(x, y, width, height) {
            rects.push({
                left: Math.round(x * pixelRatio),
                width: Math.round(width * pixelRatio),
                top: y * pixelRatio,
                height: height * pixelRatio,
                stroked: false,
            });
        },
    };
}

/**
 * @param {number} barSpacing CSS px between bar centres
 * @param {number} pixelRatio
 * @param {number} count
 */
function drawCandles(barSpacing, pixelRatio, count = 20) {
    const points = Array.from({ length: count }, (_, index) => ({
        open: 100 + index,
        high: 102 + index,
        low: 98 + index,
        close: 101 + index,
    }));
    const ctx = recordingContext(pixelRatio);

    CandlestickSeries.draw(ctx, {
        series: { byIndex: points },
        options: CandlestickSeries.defaults(),
        priceScale: { priceToY: (price) => 400 - price },
        timeScale: { barSpacing, indexToX: (index) => 20 + index * barSpacing },
        pixelRatio,
        from: 0,
        to: count - 1,
    });

    return ctx.rects;
}

/**
 * Columns the candles actually occupy, in device pixels — the same measurement
 * that caught the original defect against lightweight-charts.
 */
function occupiedColumns(rects) {
    const columns = new Set();

    for (const rect of rects.filter((candidate) => ! candidate.stroked)) {
        for (let x = rect.left; x < rect.left + rect.width; x++) {
            columns.add(x);
        }
    }

    return columns;
}

function runsIn(columns) {
    const sorted = [...columns].sort((a, b) => a - b);
    const bodies = [];
    const gaps = [];
    let run = 1;

    for (let index = 1; index < sorted.length; index++) {
        if (sorted[index] === sorted[index - 1] + 1) {
            run++;

            continue;
        }

        bodies.push(run);
        gaps.push(sorted[index] - sorted[index - 1] - 1);
        run = 1;
    }

    bodies.push(run);

    return { bodies, gaps };
}

/**
 * The defect: a one-pixel stroke centred on the body's edge extends half a
 * pixel past it, so every candle's real footprint was two pixels wider than
 * its width. At the ~5px spacing a year of daily bars leaves, that fused them
 * into a solid band.
 */
test('candles leave a gap between them at daily density', () => {
    const { gaps } = runsIn(occupiedColumns(drawCandles(5.2, 2)));

    assert.ok(gaps.length > 0, 'every candle ran into its neighbour');

    for (const gap of gaps) {
        assert.ok(gap >= 1, 'candles should not touch');
    }
});

/**
 * Coverage, not gap count, is what caught the original defect: adjacent bodies
 * are clamped apart so a one-pixel gap survives however wide they are drawn,
 * and counting gaps therefore measures the clamp rather than the width. The
 * proportion of the row filled with ink is the honest measure — it read 100%
 * when candles had fused, and 77% once they matched lightweight-charts.
 */
test('candles fill about three quarters of the space at daily density', () => {
    const columns = occupiedColumns(drawCandles(5.2, 2));
    const span = Math.max(...columns) - Math.min(...columns) + 1;
    const coverage = columns.size / span;

    assert.ok(coverage > 0.6, `only ${(coverage * 100).toFixed(0)}% inked — candles have thinned`);
    assert.ok(coverage < 0.85, `${(coverage * 100).toFixed(0)}% inked — candles are running together`);
});

/**
 * Measured per rectangle rather than per run of columns: below about four
 * pixels of spacing both engines hold candles at a visible minimum and let
 * them touch, so adjacent bodies merge into one run and run length stops
 * describing a single candle.
 */
test('a candle never draws wider than the space it was given', () => {
    for (const [barSpacing, pixelRatio] of [[5.2, 2], [8, 1], [12, 2], [3, 1], [2.6, 2]]) {
        const rects = drawCandles(barSpacing, pixelRatio).filter((rect) => ! rect.stroked);
        const widest = Math.max(...rects.map((rect) => rect.width));
        const limit = Math.ceil(barSpacing * pixelRatio);

        assert.ok(widest <= limit, `body of ${widest}px exceeds ${limit}px of spacing at ${barSpacing}/${pixelRatio}`);
    }
});

test('the border is drawn inside the body, never stroked around it', () => {
    const rects = drawCandles(5.2, 2);

    assert.equal(rects.filter((rect) => rect.stroked).length, 0, 'a stroked rectangle spills outside the body');
});

test('every candle is the same width', () => {
    const { bodies } = runsIn(occupiedColumns(drawCandles(9, 2)));
    const widest = Math.max(...bodies);
    const narrowest = Math.min(...bodies);

    assert.ok(widest - narrowest <= 1, `widths ranged from ${narrowest} to ${widest}`);
});

test('candles stay visible when bars are packed tighter than a pixel', () => {
    const rects = drawCandles(0.8, 1).filter((rect) => ! rect.stroked);

    assert.ok(rects.length > 0, 'nothing was drawn at all');

    for (const rect of rects) {
        assert.ok(rect.width >= 1, 'a candle collapsed to nothing');
    }
});

/**
 * Grid lines and the crosshair are a hairline wide. A body of the opposite
 * parity sits half a pixel off centre under the crosshair.
 */
test('body width takes the parity of the crosshair', () => {
    for (const pixelRatio of [1, 2]) {
        const { bodies } = runsIn(occupiedColumns(drawCandles(12, pixelRatio)));
        const hairline = Math.floor(pixelRatio);

        assert.equal(bodies[0] % 2, hairline % 2, `parity mismatch at ratio ${pixelRatio}`);
    }
});

test('a candle whose open equals its close still draws a body', () => {
    const ctx = recordingContext(2);

    CandlestickSeries.draw(ctx, {
        series: { byIndex: [{ open: 100, high: 101, low: 99, close: 100 }] },
        options: CandlestickSeries.defaults(),
        priceScale: { priceToY: (price) => 400 - price },
        timeScale: { barSpacing: 10, indexToX: () => 50 },
        pixelRatio: 2,
        from: 0,
        to: 0,
    });

    assert.ok(ctx.rects.length > 0, 'a doji drew nothing at all');
});

test('missing points are skipped rather than drawn at zero', () => {
    const ctx = recordingContext(2);

    CandlestickSeries.draw(ctx, {
        series: { byIndex: [{ open: 100, high: 101, low: 99, close: 100 }, undefined, { time: 3 }] },
        options: CandlestickSeries.defaults(),
        priceScale: { priceToY: (price) => 400 - price },
        timeScale: { barSpacing: 10, indexToX: (index) => 20 + index * 10 },
        pixelRatio: 2,
        from: 0,
        to: 2,
    });

    const columns = occupiedColumns(ctx.rects);

    assert.ok(columns.size > 0);
    assert.ok(Math.max(...columns) < 20 * 2 + 10 * 2, 'a missing point was drawn anyway');
});
