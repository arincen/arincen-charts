import './support/full-build.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderTarget, drawPrimitives } from '../src/render-target.js';
import { axisStrips, hitTestPrimitives, widenForPrimitives } from '../src/chart.js';

/**
 * The half of the primitive contract that reaches past the plot: labels on the
 * axes, drawing inside the axis strips, hit testing, and asking the scale for
 * room. A trend line rendered before any of this existed, which is why the
 * gap went unnoticed — anything that labelled an axis or answered a click
 * silently lost half its behaviour.
 */

function recordingContext() {
    const calls = [];
    let transform = { a: 1, d: 1, e: 0, f: 0 };

    return {
        calls,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        get currentTransform() {
            return { ...transform };
        },
        save() {
            calls.push({ op: 'save' });
        },
        restore() {
            calls.push({ op: 'restore' });
        },
        beginPath() {},
        rect() {},
        clip() {},
        translate(x, y) {
            transform = { ...transform, e: transform.e + x, f: transform.f + y };
            calls.push({ op: 'translate', x, y });
        },
        setTransform(a, b, c, d, e, f) {
            transform = { a, d, e, f };
            calls.push({ op: 'setTransform', a, d, e, f });
        },
        fillRect(x, y, width, height) {
            calls.push({ op: 'fillRect', x, y, width, height, at: { ...transform } });
        },
    };
}

/** A primitive offering one renderer for whichever set of views is asked for. */
function drawingPrimitive(views, onDraw) {
    return {
        [views]: () => [{
            zOrder: () => 'normal',
            renderer: () => ({ draw: onDraw }),
        }],
    };
}

test('a renderer for an axis strip is placed at the strip, not the canvas corner', () => {
    const ctx = recordingContext();
    const target = createRenderTarget(ctx, { width: 60, height: 400 }, 2, { x: 540, y: 10 });

    target.useBitmapCoordinateSpace(({ context }) => {
        context.fillRect(0, 0, 10, 10);
    });

    const painted = ctx.calls.find((call) => call.op === 'fillRect');

    // The defect this locks down: resetting the transform for bitmap space
    // discards any translate the caller applied, so a price-axis primitive
    // drew in the chart's top-left corner instead of on the axis.
    assert.equal(painted.at.e, 1080, 'the strip origin was lost horizontally');
    assert.equal(painted.at.f, 20, 'the strip origin was lost vertically');
});

test('media space is offset by the strip origin too', () => {
    const ctx = recordingContext();
    const target = createRenderTarget(ctx, { width: 60, height: 400 }, 2, { x: 540, y: 10 });

    target.useMediaCoordinateSpace(({ context }) => {
        context.fillRect(0, 0, 10, 10);
    });

    const painted = ctx.calls.find((call) => call.op === 'fillRect');

    assert.equal(painted.at.e, 540);
    assert.equal(painted.at.f, 10);
});

test('a target covering the whole canvas still starts at the origin', () => {
    const ctx = recordingContext();
    const target = createRenderTarget(ctx, { width: 600, height: 400 }, 2);

    target.useBitmapCoordinateSpace(({ context }) => {
        context.fillRect(0, 0, 10, 10);
    });

    const painted = ctx.calls.find((call) => call.op === 'fillRect');

    assert.equal(painted.at.e, 0);
    assert.equal(painted.at.f, 0);
});

test('the axis strips ask for their own views, not the pane views', () => {
    const drawn = [];
    const primitive = {
        paneViews: () => [{ zOrder: () => 'normal', renderer: () => ({ draw: () => drawn.push('pane') }) }],
        priceAxisPaneViews: () => [{ zOrder: () => 'normal', renderer: () => ({ draw: () => drawn.push('price') }) }],
        timeAxisPaneViews: () => [{ zOrder: () => 'normal', renderer: () => ({ draw: () => drawn.push('time') }) }],
    };

    drawPrimitives([primitive], 'normal', {}, 'priceAxisPaneViews');
    drawPrimitives([primitive], 'normal', {}, 'timeAxisPaneViews');

    assert.deepEqual(drawn, ['price', 'time'], 'the wrong set of views was drawn');
});

test('the pane views remain the default, so existing primitives are unaffected', () => {
    const drawn = [];

    drawPrimitives([drawingPrimitive('paneViews', () => drawn.push('pane'))], 'normal', {});

    assert.deepEqual(drawn, ['pane']);
});

test('a primitive that throws while listing views loses only its own drawing', () => {
    const drawn = [];
    const broken = { priceAxisPaneViews: () => { throw new Error('no'); } };
    const working = drawingPrimitive('priceAxisPaneViews', () => drawn.push('drew'));

    drawPrimitives([broken, working], 'normal', {}, 'priceAxisPaneViews');

    assert.deepEqual(drawn, ['drew'], 'one broken primitive took the others with it');
});

/* ------------------------------------------------------------ axis strips */

// A 600x400 chart with a 60px price axis and a 30px time axis.
const plot = { left: 0, top: 0, right: 540, bottom: 370 };

test('the price strip is the axis column, and the time strip the axis row', () => {
    const [price, time] = axisStrips(plot, 600, 400);

    assert.deepEqual(
        { left: price.left, top: price.top, width: price.width, height: price.height },
        { left: 540, top: 0, width: 60, height: 370 },
    );
    assert.deepEqual(
        { left: time.left, top: time.top, width: time.width, height: time.height },
        { left: 0, top: 370, width: 540, height: 30 },
    );
});

/**
 * The property that matters: a strip must not reach back over the plot. One
 * that did would let a primitive paint across the candles from what its author
 * believed was the axis.
 */
test('neither strip overlaps the plot', () => {
    const [price, time] = axisStrips(plot, 600, 400);

    assert.ok(price.left >= plot.right, 'the price strip reached back over the plot');
    assert.ok(time.top >= plot.bottom, 'the time strip reached up over the plot');
});

test('an axis that is not shown has no strip to draw into', () => {
    // Both axes hidden: the plot fills the canvas.
    const [price, time] = axisStrips({ left: 0, top: 0, right: 600, bottom: 400 }, 600, 400);

    assert.equal(price.width, 0);
    assert.equal(time.height, 0);
});

test('a plot larger than the canvas gives empty strips rather than negative ones', () => {
    const [price, time] = axisStrips({ left: 0, top: 0, right: 700, bottom: 500 }, 600, 400);

    assert.equal(price.width, 0, 'a negative width would flip the rectangle');
    assert.equal(time.height, 0);
});

test('a pane below another starts its price strip at the pane, not the canvas top', () => {
    const [price] = axisStrips({ left: 0, top: 0, right: 540, bottom: 370 }, 600, 400);

    assert.equal(price.top, 0);
    assert.equal(price.height, 370, 'the strip should span the plot vertically');
});

test('each strip names the views it is for', () => {
    const [price, time] = axisStrips(plot, 600, 400);

    assert.equal(price.views, 'priceAxisPaneViews');
    assert.equal(time.views, 'timeAxisPaneViews');
});

/* ------------------------------------------------------------- hit testing */

const hits = (...results) => results.map((result) => ({ hitTest: () => result }));

test('nothing under the pointer is nothing hit', () => {
    assert.equal(hitTestPrimitives(hits(null, undefined), 10, 10), null);
    assert.equal(hitTestPrimitives([], 10, 10), null);
});

test('a hit on a higher layer beats one underneath it', () => {
    const winner = hitTestPrimitives(hits(
        { externalId: 'under', zOrder: 'bottom', distance: 0 },
        { externalId: 'over', zOrder: 'top', distance: 40 },
    ), 10, 10);

    assert.equal(winner.externalId, 'over', 'a distant hit on top lost to a close one underneath');
});

/**
 * A drawing's handles sit on top of its own fill, so if distance alone decided
 * you could never grab an endpoint that lies inside the shape — the region
 * would win every time, and the drawing would be unresizable.
 */
test('a point beats a region on the same layer however far away it is', () => {
    const winner = hitTestPrimitives(hits(
        { externalId: 'region', zOrder: 'normal', distance: 0, hitTestPriority: 0 },
        { externalId: 'handle', zOrder: 'normal', distance: 9, hitTestPriority: 2 },
    ), 10, 10);

    assert.equal(winner.externalId, 'handle');
});

test('otherwise the nearer hit wins', () => {
    const winner = hitTestPrimitives(hits(
        { externalId: 'far', zOrder: 'normal', distance: 12 },
        { externalId: 'near', zOrder: 'normal', distance: 3 },
    ), 10, 10);

    assert.equal(winner.externalId, 'near');
});

test('an equal tie keeps the order the primitives were attached in', () => {
    const winner = hitTestPrimitives(hits(
        { externalId: 'first', zOrder: 'normal', distance: 5 },
        { externalId: 'second', zOrder: 'normal', distance: 5 },
    ), 10, 10);

    assert.equal(winner.externalId, 'first');
});

test('a primitive that throws while hit testing is simply not hit', () => {
    const broken = { hitTest: () => { throw new Error('no'); } };
    const working = { hitTest: () => ({ externalId: 'ok', zOrder: 'normal', distance: 1 }) };

    assert.equal(hitTestPrimitives([broken, working], 10, 10).externalId, 'ok');
});

test('a hit carries forward across panes rather than restarting', () => {
    const first = hitTestPrimitives(hits({ externalId: 'pane-one', zOrder: 'top', distance: 2 }), 10, 10);
    const second = hitTestPrimitives(hits({ externalId: 'pane-two', zOrder: 'normal', distance: 0 }), 10, 10, first);

    assert.equal(second.externalId, 'pane-one', 'the earlier pane\'s better hit was dropped');
});

/* --------------------------------------------------------------- autoscale */

const scaling = (minValue, maxValue) => ({ autoscaleInfo: () => ({ priceRange: { minValue, maxValue } }) });

test('a primitive can ask the scale for room above and below the data', () => {
    const range = widenForPrimitives([scaling(50, 250)], { minValue: 100, maxValue: 200 }, 0, 10);

    assert.deepEqual(range, { minValue: 50, maxValue: 250 });
});

/**
 * Only ever widens. A primitive returning a narrower range would be asking the
 * chart to hide part of the price, which is not a primitive's call.
 */
test('a primitive cannot narrow the range and hide the price', () => {
    const range = widenForPrimitives([scaling(120, 180)], { minValue: 100, maxValue: 200 }, 0, 10);

    assert.deepEqual(range, { minValue: 100, maxValue: 200 });
});

test('a primitive alone on an empty series still sets the range', () => {
    assert.deepEqual(widenForPrimitives([scaling(1, 9)], null, 0, 10), { minValue: 1, maxValue: 9 });
});

test('a series with no data and no primitive range stays empty', () => {
    assert.equal(widenForPrimitives([{}], null, 0, 10), null);
});

test('nonsense from a primitive is ignored rather than poisoning the scale', () => {
    const base = { minValue: 100, maxValue: 200 };

    for (const info of [
        { priceRange: { minValue: NaN, maxValue: 300 } },
        { priceRange: { minValue: 0, maxValue: Infinity } },
        { priceRange: null },
        null,
    ]) {
        assert.deepEqual(widenForPrimitives([{ autoscaleInfo: () => info }], base, 0, 10), base);
    }

    assert.deepEqual(
        widenForPrimitives([{ autoscaleInfo: () => { throw new Error('no'); } }], base, 0, 10),
        base,
    );
});
