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
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width: number, height: number}} mediaSize CSS pixel size
 * @param {number} pixelRatio
 * @return {{useBitmapCoordinateSpace: Function, useMediaCoordinateSpace: Function}}
 */
export function createRenderTarget(ctx, mediaSize, pixelRatio) {
    return {
        useBitmapCoordinateSpace(callback) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);

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
 * @param {Object[]} primitives
 * @param {'bottom'|'normal'|'top'} layer
 * @param {Object} target
 */
export function drawPrimitives(primitives, layer, target) {
    for (const primitive of primitives) {
        let views;

        try {
            views = primitive.paneViews?.() ?? [];
        } catch {
            continue;
        }

        for (const view of views) {
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
