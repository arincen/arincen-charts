/**
 * The canvas handed to a primitive's renderer.
 *
 * Our own drawing works in CSS pixels — the context carries a devicePixelRatio
 * transform, so a line at y=100 lands where the caller means. Primitives are
 * written against the other convention: bitmap space, where coordinates are
 * device pixels and the drawing multiplies by the ratios itself. That is what
 * lets a one-pixel line stay one physical pixel on a retina screen instead of
 * blurring across two.
 *
 * So the transform is reset for the duration of the callback and restored
 * after. A clip region set earlier still applies: clips are stored in device
 * space once set, and changing the transform afterwards does not move them.
 *
 * An origin may be given for a target that covers part of the canvas rather
 * than all of it — an axis strip. It cannot be applied with `translate` by the
 * caller, because resetting the transform for bitmap space would throw that
 * translation away and the drawing would appear in the chart's top-left
 * corner. It belongs in the reset itself.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width: number, height: number}} mediaSize CSS pixel size
 * @param {number} pixelRatio
 * @param {{x: number, y: number}} [origin] top-left of the target, in CSS px
 * @return {{useBitmapCoordinateSpace: Function, useMediaCoordinateSpace: Function}}
 */
export function createRenderTarget(ctx, mediaSize, pixelRatio, origin = { x: 0, y: 0 }) {
    return {
        useBitmapCoordinateSpace(callback) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, Math.round(origin.x * pixelRatio), Math.round(origin.y * pixelRatio));

            try {
                return callback({
                    context: ctx,
                    bitmapSize: {
                        width: Math.round(mediaSize.width * pixelRatio),
                        height: Math.round(mediaSize.height * pixelRatio),
                    },
                    mediaSize,
                    horizontalPixelRatio: pixelRatio,
                    verticalPixelRatio: pixelRatio,
                });
            } finally {
                ctx.restore();
            }
        },

        useMediaCoordinateSpace(callback) {
            ctx.save();
            ctx.translate(origin.x, origin.y);

            try {
                return callback({ context: ctx, mediaSize });
            } finally {
                ctx.restore();
            }
        },
    };
}

/**
 * Runs every renderer a primitive offers for one layer of the stack.
 *
 * A primitive that throws is skipped rather than allowed to take the frame
 * down with it — third-party drawing code should not be able to blank the
 * chart it is drawn on.
 *
 * The set of views is named rather than fixed, because the same renderer
 * contract serves the plot and both axis strips — only the question differs.
 *
 * @param {Object[]} primitives
 * @param {'bottom'|'normal'|'top'} layer
 * @param {Object} target
 * @param {string} [views] which set of views to ask for
 */
export function drawPrimitives(primitives, layer, target, views = 'paneViews') {
    for (const primitive of primitives) {
        let list;

        try {
            list = primitive[views]?.() ?? [];
        } catch {
            continue;
        }

        for (const view of list) {
            const zOrder = view.zOrder?.() ?? 'normal';

            if (zOrder !== layer) {
                continue;
            }

            try {
                const renderer = view.renderer?.();

                renderer?.drawBackground?.(target);
                renderer?.draw?.(target);
            } catch {
                // A broken primitive loses its own drawing, not the chart.
            }
        }
    }
}
