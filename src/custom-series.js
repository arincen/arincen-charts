import { commonDefaults } from './series.js';

/**
 * Turns a caller's pane view into a series definition the chart can draw.
 *
 * A custom series is the second extension point, and a deeper one than a
 * primitive: a primitive decorates a chart that already knows how to draw
 * itself, where this replaces the drawing entirely. Stacked areas, heatmaps
 * and HLC bands are all written this way rather than built in — which is why
 * lightweight-charts ships them as examples and not as library code.
 *
 * The whole thing is a free function called from behind `FULL_BUILD`, so the
 * light bundle drops it along with everything it references.
 *
 * @param {Object} paneView implements renderer/update/priceValueBuilder/defaultOptions
 * @return {Object} a definition `addSeries` accepts
 */
export function customSeriesDefinition(paneView) {
    return {
        type: 'Custom',

        // Prices come from the view rather than from a `value` field, and the
        // low and high they imply are what the axis is scaled against — so the
        // series is treated as bar-like even when it draws a line.
        isBarLike: true,

        paneView,

        priceValues: (raw) => {
            const values = paneView.priceValueBuilder?.(raw) ?? [];

            return values.filter((value) => Number.isFinite(value));
        },

        defaults: () => ({ ...commonDefaults(), ...(paneView.defaultOptions?.() ?? {}) }),

        lastValueColor: (options) => options.color ?? options.lineColor ?? '#2962ff',

        draw(ctx, context) {
            const { series, options, priceScale, timeScale, target, from, to } = context;
            const bars = [];

            for (let index = from; index <= to; index++) {
                const point = series.byIndex[index];

                if (! point || paneView.isWhitespace?.(point.raw)) {
                    continue;
                }

                bars.push({
                    x: timeScale.indexToX(index),
                    time: index,
                    originalData: point.raw,
                });
            }

            if (! bars.length) {
                return;
            }

            paneView.update(
                {
                    bars,
                    barSpacing: timeScale.barSpacing,
                    visibleRange: { from: 0, to: bars.length },
                },
                options,
            );

            // The renderer is handed the same price converter lightweight-charts
            // passes: a function, not a scale, so a view never has to know what
            // kind of axis it is drawing against.
            const priceToCoordinate = (price) => {
                const y = priceScale.priceToY(price);

                return Number.isFinite(y) ? y : null;
            };

            try {
                paneView.renderer()?.draw?.(target, priceToCoordinate, false);
            } catch {
                // A broken view loses its own drawing, not the chart — the same
                // bargain primitives get.
            }
        },
    };
}
