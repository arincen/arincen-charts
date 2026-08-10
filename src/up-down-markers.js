/**
 * Up/down markers.
 *
 * A dot on any bar whose value has changed since it was first drawn, coloured
 * by which way it went. It exists for the case a streaming chart is worst at
 * explaining: a bar that was already on screen quietly gets a new value, the
 * line redraws, and nothing says which point moved or whether it moved up.
 *
 * The plugin keeps the previous value itself rather than asking the series,
 * because by the time anything is drawn the series only knows the new one —
 * the comparison has to be captured at the moment of the update or not at all.
 */

const DEFAULTS = {
    positiveColor: '#22ab94',
    negativeColor: '#f23645',
    updateVisibilityDuration: 5000,
};

const MARKER_RADIUS = 4;

/**
 * @param {Object} [options]
 * @return {Object} a primitive, with `setData` and `update` of its own
 */
export function createUpDownMarkers(options) {
    const settings = { ...DEFAULTS, ...(options ?? {}) };
    const marks = new Map();

    let series = null;
    let chart = null;
    let requestUpdate = null;

    const now = () => (typeof performance === 'undefined' ? 0 : performance.now());

    const expire = () => {
        if (! settings.updateVisibilityDuration) {
            return;
        }

        const cutoff = now() - settings.updateVisibilityDuration;

        for (const [time, mark] of marks) {
            if (mark.at < cutoff) {
                marks.delete(time);
            }
        }
    };

    return {
        updateAllViews: expire,
        applyOptions: (next) => Object.assign(settings, next ?? {}),
        options: () => settings,

        attached: (params) => {
            series = params?.series ?? null;
            chart = params?.chart ?? null;
            requestUpdate = params?.requestUpdate ?? null;
        },

        detached: () => {
            marks.clear();
            series = null;
            chart = null;
            requestUpdate = null;
        },

        /** Replaces the data and forgets every mark; nothing has moved yet. */
        setData: (data) => {
            marks.clear();
            series?.setData(data);
            requestUpdate?.();
        },

        /**
         * Passes the point through to the series, having first noticed whether
         * it changes a value that was already there.
         */
        update: (point, historicalUpdate) => {
            if (! series) {
                return;
            }

            const existing = series.data().find((item) => item.time === point.time);
            const before = existing?.value ?? existing?.close;
            const after = point.value ?? point.close;

            if (existing && before !== undefined && after !== undefined && before !== after) {
                marks.set(point.time, { at: now(), rising: after > before, value: after });
            }

            series.update(point, historicalUpdate);
            requestUpdate?.();
        },

        markers: () => [...marks.entries()].map(([time, mark]) => ({ time, ...mark })),
        clearMarkers: () => {
            marks.clear();
            requestUpdate?.();
        },

        paneViews: () => [{
            zOrder: () => 'top',
            renderer: () => ({
                draw(target) {
                    if (! series || ! chart || ! marks.size) {
                        return;
                    }

                    target.useMediaCoordinateSpace(({ context }) => {
                        const timeScale = chart.timeScale();

                        context.save();

                        for (const [time, mark] of marks) {
                            const x = timeScale.timeToCoordinate(time);
                            const y = series.priceToCoordinate(mark.value);

                            if (x === null || y === null) {
                                continue;
                            }

                            context.fillStyle = mark.rising ? settings.positiveColor : settings.negativeColor;
                            context.beginPath();
                            context.arc(x, y, MARKER_RADIUS, 0, Math.PI * 2);
                            context.fill();
                        }

                        context.restore();
                    });
                },
            }),
        }],
    };
}
