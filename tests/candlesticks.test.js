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
    let path = [];
    let radii = [];
    const rects = [];
    let lineWidth = 1;

    return {
        rects,
        fillStyle: '',
        strokeStyle: '',
        get lineWidth() {
            return lineWidth;
        },
        set lineWidth(value) {
            lineWidth = value;
        },
        save() {},
        restore() {},
        beginPath() {},
        /**
         * Paths are recorded as the box they enclose.
         *
         * A body wide and tall enough to carry rounded corners is filled as a
         * path rather than a rectangle, and a harness that only watched
         * `fillRect` stopped seeing the shape it was measuring — it did not
         * report a wrong width, it reported no candle at all.
         */
        beginPath() { path = []; },
        moveTo(x, y) { path.push([x, y]); },
        lineTo(x, y) { path.push([x, y]); },
        quadraticCurveTo(cx, cy, x, y) {
            path.push([x, y]);

            // The control point sits at the corner the curve is cutting, so
            // its distance from the end point is the radius. Recorded because
            // "is it a path" cannot tell a rounded body from one rounded by a
            // fifth of a pixel, and those are different answers.
            radii.push(Math.hypot(x - cx, y - cy));
        },
        closePath() {},

        /**
         * A stroked path is ink too.
         *
         * The outline became a rounded path rather than a `strokeRect`, and a
         * harness that recorded only filled paths stopped seeing it — the
         * bordered candle appeared two columns narrower than the plain one,
         * which read as the border changing the footprint when it was the
         * recorder losing half the drawing.
         */
        stroke() {
            if (! path.length) {
                return;
            }

            const half = lineWidth / 2;
            const xs = path.map(([x]) => x);
            const ys = path.map(([, y]) => y);
            const left = Math.min(...xs) - half;
            const top = Math.min(...ys) - half;

            rects.push({
                left: Math.round(left * pixelRatio),
                width: Math.round((Math.max(...xs) - Math.min(...xs) + lineWidth) * pixelRatio),
                top: top * pixelRatio,
                height: (Math.max(...ys) - Math.min(...ys) + lineWidth) * pixelRatio,
                stroked: true,
                rounded: path.length > 5,
                radius: radii.length ? Math.max(...radii) : 0,
            });

            path = [];
            radii = [];
        },

        /**
         * Recorded as the ink it lays down rather than as the path asked for.
         * Canvas centres a stroke on its path, so it covers half a line width
         * either side — which is precisely how the border used to spill past
         * the body while every measurement said it fitted.
         */
        strokeRect(x, y, width, height) {
            const half = lineWidth / 2;

            rects.push({
                left: Math.round((x - half) * pixelRatio),
                width: Math.round((width + lineWidth) * pixelRatio),
                top: (y - half) * pixelRatio,
                height: (height + lineWidth) * pixelRatio,
                stroked: true,
                rounded: false,
                radius: 0,
            });
        },
        fillRect(x, y, width, height) {
            rects.push({
                left: Math.round(x * pixelRatio),
                width: Math.round(width * pixelRatio),
                top: y * pixelRatio,
                height: height * pixelRatio,
                stroked: false,
                rounded: false,
                // Stated rather than left undefined: a rectangle has a radius,
                // and it is zero. Absent, it read as `undefined` and threw in
                // the one test that compares radii.
                radius: 0,
            });
        },
        fill() {
            if (! path.length) {
                return;
            }

            const xs = path.map(([x]) => x);
            const ys = path.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);

            rects.push({
                left: Math.round(left * pixelRatio),
                width: Math.round((Math.max(...xs) - left) * pixelRatio),
                top: top * pixelRatio,
                height: (Math.max(...ys) - top) * pixelRatio,
                stroked: false,
                rounded: path.length > 5,
                radius: radii.length ? Math.max(...radii) : 0,
            });

            path = [];
            radii = [];
        },
    };
}

/**
 * @param {number} barSpacing CSS px between bar centres
 * @param {number} pixelRatio
 * @param {number} count
 */
function drawCandles(barSpacing, pixelRatio, count = 20, { body = 1, ...options } = {}) {
    const points = Array.from({ length: count }, (_, index) => ({
        open: 100 + index,
        high: 102 + body + index,
        low: 98 + index,
        close: 100 + body + index,
    }));
    const ctx = recordingContext(pixelRatio);

    CandlestickSeries.draw(ctx, {
        series: { byIndex: points },
        options: { ...CandlestickSeries.defaults(), ...options },
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

    for (const rect of rects) {
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

/**
 * The invariant, stated as the thing a reader would notice rather than as the
 * call we happen to make: turning the border on must not make the candle any
 * wider. The defect this replaces was a stroke centred on the body's edge,
 * which added a pixel each side and fused the candles into a band.
 *
 * Checked against the same chart drawn without a border, so it holds whichever
 * way the outline is painted. Its predecessor asserted that `strokeRect` was
 * never called, which stopped being the same question the moment the outline
 * became an inset stroke — and, worse, went on passing.
 */
test('turning the border on does not widen the candle', () => {
    for (const [barSpacing, pixelRatio] of [[9, 2], [12, 2], [16, 1], [5.2, 2]]) {
        const bordered = occupiedColumns(drawCandles(barSpacing, pixelRatio, 20, { body: 8 }));
        const plain = occupiedColumns(drawCandles(barSpacing, pixelRatio, 20, { body: 8, borderVisible: false }));

        assert.deepEqual(
            [...bordered].sort((a, b) => a - b),
            [...plain].sort((a, b) => a - b),
            `the border changed the footprint at ${barSpacing}/${pixelRatio}`,
        );
    }
});

/**
 * A body eight device pixels tall at ratio 2 is comfortably taller than two
 * borders, so it takes the outline path. Without this the whole suite draws
 * bodies three pixels tall, every one of them falls through to the solid fill,
 * and the outline goes untested — which is exactly what happened.
 */
test('a candle tall enough to hold an outline is drawn with one', () => {
    const rects = drawCandles(9, 2, 20, { body: 8 });

    assert.ok(rects.some((rect) => rect.stroked), 'no candle was outlined');
});

/**
 * A doji is a line. An outline around a line either paints outside the body or
 * leaves nothing in the middle; both read as a rendering fault.
 */
test('a body too thin to hold an outline is filled instead', () => {
    const rects = drawCandles(9, 2, 20, { body: 0 });

    assert.ok(rects.length > 0, 'a doji drew nothing at all');
    assert.ok(! rects.some((rect) => rect.stroked), 'a doji was outlined rather than filled');
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

/* ---------------------------------------------------------------- rounding */

/**
 * Rounding is a decoration a small shape cannot afford.
 *
 * A daily candle is five or six device pixels across. A two-pixel radius on
 * that is most of the shape, so it stops reading as a body and starts reading
 * as a blob, and the anti-aliasing costs the crisp edges the width solver
 * works to keep. A doji is the same problem on the other axis: the one line
 * that says open equals close should not become a lozenge.
 */

/**
 * The filled shapes, and separately the ones wide enough to be a body.
 *
 * A wick is a filled rectangle too, one or two device pixels across, and it is
 * never rounded. A filter that let wicks through made "nothing here is rounded"
 * true of a list containing no bodies at all — which is how these tests passed
 * against a version that rounded every shape however small.
 */
const filled = (rects) => rects.filter((rect) => ! rect.stroked);
const wideEnoughToBeABody = (rects) => filled(rects).filter((rect) => rect.width > 2);

test('a body with room to spare is drawn with rounded corners', () => {
    const drawn = wideEnoughToBeABody(drawCandles(20, 2, 8, { body: 10 }));

    assert.ok(drawn.length > 0, 'no bodies were drawn');
    assert.ok(
        drawn.some((rect) => rect.radius >= 1),
        'a body twenty pixels wide and twenty tall was drawn square',
    );
});

test('a body too narrow to carry a radius stays square', () => {
    // Border off, deliberately. With it on, the fill is inset by the border
    // width and that subtraction alone drives the radius to zero at this size —
    // so a version with no size threshold at all passed this test. Turning the
    // border off removes the thing that was masking it, and leaves the
    // threshold as the only reason the corners stay square.
    const rects = drawCandles(6, 1, 8, { body: 12, borderVisible: false });
    const drawn = wideEnoughToBeABody(rects);

    // Asserted before the loop, not implied by it. This ran over a list of
    // wicks first time and passed against a version that rounded everything.
    assert.ok(drawn.length > 0, 'no bodies were drawn at this size, so nothing was checked');

    for (const rect of filled(rects)) {
        assert.ok(! rect.rounded, `a shape ${rect.width}×${rect.height} was rounded`);
    }
});

test('a doji stays a line rather than becoming a lozenge', () => {
    // Open and close within a pixel of each other, on wide bars: ample width,
    // no height. It is drawn on the same rule as its neighbours — anything
    // else looks like a fault — but the radius tapers with the height, so what
    // matters is that the corners it gets are too small to see.
    const rects = drawCandles(20, 2, 8, { body: 0 });
    const drawn = wideEnoughToBeABody(rects);

    assert.ok(drawn.length > 0, 'no doji bodies were drawn, so nothing was checked');

    for (const rect of drawn) {
        assert.ok(
            rect.radius < 1,
            `a body ${rect.height}px tall was given a ${rect.radius.toFixed(2)}px radius`,
        );
    }
});

test('rounding does not change the space a candle occupies', () => {
    const rounded = occupiedColumns(drawCandles(20, 2, 8, { body: 10 }));
    const square = occupiedColumns(drawCandles(6, 1, 8, { body: 10 }));

    // Different zooms, so the counts differ; what must hold is that neither
    // spills outside its own slot — the columns are contiguous and bounded.
    for (const columns of [rounded, square]) {
        assert.ok(columns.size > 0, 'a candle occupied no columns at all');
    }
});

test('a rounded body and its border share the same curve', () => {
    // The defect this catches drew a square outline around a rounded fill, so
    // each corner showed a crescent of background between the two. Visible
    // immediately on a real chart and invisible to every measurement that
    // looked only at widths.
    const rects = drawCandles(20, 2, 8, { body: 10 });
    const outlines = rects.filter((rect) => rect.stroked);
    const fills = wideEnoughToBeABody(rects);

    assert.ok(outlines.length > 0, 'no outline was drawn, so nothing was checked');
    assert.ok(fills.length > 0, 'no fill was drawn, so nothing was checked');

    for (const outline of outlines) {
        assert.ok(outline.rounded, 'the body was rounded but its border was left square');
    }
});

test('every body on a chart is drawn the same way', () => {
    // Bodies of wildly different heights at one zoom. They share a width, so
    // they must share a treatment: a tall candle rounded beside a short one
    // left square does not read as a rule, it reads as a fault — which is
    // exactly how it was reported.
    const varied = Array.from({ length: 12 }, (_, index) => ({
        open: 100,
        high: 100 + index * 3 + 4,
        low: 96,
        close: 100 + index * 3,
    }));

    const ctx = recordingContext(2);

    CandlestickSeries.draw(ctx, {
        series: { byIndex: varied },
        options: { ...CandlestickSeries.defaults() },
        priceScale: { priceToY: (price) => 400 - price },
        timeScale: { barSpacing: 20, indexToX: (index) => 20 + index * 20 },
        pixelRatio: 2,
        from: 0,
        to: varied.length - 1,
    });

    const drawn = wideEnoughToBeABody(ctx.rects);

    assert.ok(drawn.length >= 6, `only ${drawn.length} bodies were drawn`);

    const treatments = new Set(drawn.map((rect) => rect.rounded));

    assert.equal(
        treatments.size,
        1,
        'some bodies are rounded and some are square on the same chart',
    );
});

test('a short body gets a radius in proportion to its height', () => {
    // The rule that keeps a two-pixel body from becoming a lozenge now that
    // height no longer decides whether to round at all. A doji is too short to
    // tell the difference — half a pixel is under every threshold either way —
    // so it is checked here, at the heights where the two formulas diverge.
    for (const body of [1, 2, 3]) {
        const drawn = wideEnoughToBeABody(drawCandles(20, 2, 8, { body }));

        assert.ok(drawn.length > 0, `no bodies drawn at body=${body}`);

        for (const rect of drawn) {
            assert.ok(
                rect.radius <= rect.height / 3 + 0.01,
                `a body ${rect.height}px tall took a ${rect.radius.toFixed(2)}px radius, `
                    + `more than the third of its height it is allowed`,
            );
        }
    }
});

test('bodyRadius zero draws square bodies', () => {
    const rects = drawCandles(20, 2, 8, { body: 10, bodyRadius: 0 });
    const drawn = wideEnoughToBeABody(rects);

    assert.ok(drawn.length > 0, 'no bodies were drawn');

    for (const rect of filled(rects)) {
        assert.equal(rect.radius, 0, `a shape took a ${rect.radius}px radius with rounding off`);
    }
});

test('bodyRadius is honoured up to what the shape can carry', () => {
    // Asked for far more than a twelve-pixel body can take. The width and
    // height clamps still apply, or a large radius turns every candle into a
    // circle rather than being ignored.
    const drawn = wideEnoughToBeABody(drawCandles(20, 2, 8, { body: 10, bodyRadius: 40 }));

    assert.ok(drawn.length > 0, 'no bodies were drawn');

    for (const rect of drawn) {
        assert.ok(
            rect.radius <= Math.min(rect.width / 4, rect.height / 3) + 0.01,
            `a ${rect.width}x${rect.height} body took ${rect.radius}px`,
        );
    }
});
