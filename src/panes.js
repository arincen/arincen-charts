import { PriceScale } from './scales.js';
import { mergeOptions } from './options.js';

/**
 * A pane is one plotting area with its own price scale, series and vertical
 * slice of the chart. Every chart has at least one; only the full build can
 * have more.
 *
 * The single-pane case is not a special case of the multi-pane one — it is the
 * only shape the light build knows. Everything below `createPane` is a
 * module-level free function called solely from behind `FULL_BUILD`, so the
 * light bundle drops it: a minifier will never remove a class method, because
 * it cannot prove nothing calls it dynamically, but an unreferenced function
 * is exactly what it can delete.
 *
 * @param {Object} chart
 * @param {Object} scaleOptions price-scale options this pane owns
 * @param {number} [stretchFactor] share of the height relative to the others
 * @return {Object}
 */
export function createPane(chart, scaleOptions, stretchFactor = 1) {
    return {
        chart,
        options: scaleOptions,
        priceScale: new PriceScale(scaleOptions),
        series: [],
        primitives: [],
        plot: { left: 0, top: 0, right: 0, bottom: 0 },
        autoScale: true,
        manualRange: null,
        stretchFactor,
    };
}

/**
 * The main pane is worth two of any pane added after it, so an oscillator
 * dropped underneath a price chart takes a third of the height rather than
 * half of it.
 *
 * Two rather than some finer ratio because the price is the subject and the
 * indicator is the annotation, and a reader given half the chart for an RSI
 * reads a chart about the RSI. A third is enough to see an oscillator cross
 * its bands, and it is what a caller who never sets `stretchFactor` gets.
 */
export const MAIN_PANE_STRETCH = 2;

export const RIGHT_SCALE = 'right';
export const LEFT_SCALE = 'left';

/**
 * The record that owns a price scale: the scale itself, the options it reads,
 * and whether it is autoscaling.
 *
 * The pane *is* that record for the right-hand scale. Everything already kept
 * `priceScale`, `options`, `autoScale` and `manualRange` directly on the pane,
 * and giving extra scales the same field names lets the drawing and
 * autoscaling code treat one shape whether it was handed a pane or a scale —
 * no branch at each use, and no rename across the whole file.
 *
 * @param {Object} pane
 * @param {string} [id]
 * @return {Object}
 */
export function scaleRecord(pane, id) {
    if (! id || id === RIGHT_SCALE) {
        return pane;
    }

    if (! pane.extraScales) {
        pane.extraScales = new Map();
    }

    let record = pane.extraScales.get(id);

    if (! record) {
        const source = id === LEFT_SCALE
            ? (pane.chart.options.leftPriceScale ?? pane.options)
            : pane.options;

        record = {
            id,
            options: mergeOptions({}, source),
            autoScale: true,
            manualRange: null,
        };
        record.priceScale = new PriceScale(record.options);
        pane.extraScales.set(id, record);
    }

    return record;
}

/**
 * Every scale on a pane, the pane's own first.
 *
 * @param {Object} pane
 * @return {Object[]}
 */
export function paneScales(pane) {
    return pane.extraScales ? [pane, ...pane.extraScales.values()] : [pane];
}

/**
 * The scale drawn down the left-hand gutter, if one was asked for. Every other
 * non-right scale is an overlay: it scales its own series and draws no axis.
 *
 * @param {Object} pane
 * @return {Object|null}
 */
export function leftScale(pane) {
    return pane.extraScales?.get(LEFT_SCALE) ?? null;
}

/**
 * Thickness of the line drawn between two panes. The line is hairline-thin
 * but the grab area around it is not — a divider you can only hit within one
 * pixel is a divider nobody discovers.
 */
export const SEPARATOR_HEIGHT = 1;

/** How far either side of a separator still counts as grabbing it. */
const SEPARATOR_GRAB = 5;

/**
 * A pane stops being a pane below roughly two and a half lines of the chart's
 * own type — there is nowhere left to put an axis label and a plot.
 *
 * Measured in lines rather than fixed in pixels so a chart set in sixteen
 * point gets a floor to match, which a hard-coded number cannot do. At the
 * default twelve it works out at the thirty pixels this used to be.
 */
const MIN_PANE_LINES = 2.5;
const FALLBACK_FONT_SIZE = 12;

/**
 * @param {Object} chart
 * @return {number} CSS px
 */
function minPaneHeight(chart) {
    return Math.round((chart.options.layout?.fontSize || FALLBACK_FONT_SIZE) * MIN_PANE_LINES);
}

export function paneDefaults() {
    return {
        enableResize: true,
        separatorColor: '#E0E3EB',
        separatorHoverColor: 'rgba(178, 181, 189, 0.2)',
    };
}

/**
 * Divides the plot's vertical space between the panes by stretch factor.
 *
 * The last pane takes whatever is left rather than its computed share, so
 * rounding cannot leave a one-pixel strip of background above the time axis.
 *
 * @param {Object} chart
 */
export function layoutPanes(chart) {
    const { panes, plot } = chart;
    const gaps = (panes.length - 1) * SEPARATOR_HEIGHT;
    const available = Math.max(0, plot.bottom - plot.top - gaps);
    const total = panes.reduce((sum, pane) => sum + pane.stretchFactor, 0) || 1;
    let top = plot.top;

    panes.forEach((pane, index) => {
        const last = index === panes.length - 1;
        const height = last
            ? Math.max(0, plot.bottom - top)
            : Math.round((available * pane.stretchFactor) / total);

        pane.plot = { left: plot.left, right: plot.right, top, bottom: top + height };
        top += height + SEPARATOR_HEIGHT;
    });
}

/**
 * @param {Object} chart
 * @param {number} y
 * @return {Object|null}
 */
export function paneAtY(chart, y) {
    return chart.panes.find((pane) => y >= pane.plot.top && y <= pane.plot.bottom)
        ?? chart.panes[chart.panes.length - 1]
        ?? null;
}

/**
 * Index of the separator under `y`, or -1.
 *
 * @param {Object} chart
 * @param {number} y
 * @return {number}
 */
export function separatorAt(chart, y) {
    for (let index = 0; index < chart.panes.length - 1; index++) {
        const centre = chart.panes[index].plot.bottom + SEPARATOR_HEIGHT / 2;

        if (Math.abs(y - centre) <= SEPARATOR_GRAB) {
            return index;
        }
    }

    return -1;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} chart
 * @param {number} hovered index of the separator under the pointer, or -1
 */
export function drawPaneSeparators(ctx, chart, hovered) {
    const { separatorColor, separatorHoverColor } = chart.options.layout.panes;

    for (let index = 0; index < chart.panes.length - 1; index++) {
        const top = chart.panes[index].plot.bottom;

        ctx.fillStyle = separatorColor;
        ctx.fillRect(chart.plot.left, top, chart.width, SEPARATOR_HEIGHT);

        // The hover tint is laid over the line rather than replacing it, so a
        // translucent colour reads as a highlight instead of erasing the
        // divider it is meant to draw attention to.
        if (index === hovered) {
            ctx.fillStyle = separatorHoverColor;
            ctx.fillRect(chart.plot.left, top - SEPARATOR_GRAB, chart.width, SEPARATOR_GRAB * 2 + SEPARATOR_HEIGHT);
        }
    }
}

/**
 * Moves height between the two panes a separator divides.
 *
 * Stretch factors are rewritten rather than pixel heights, so the split
 * survives a resize of the chart itself — the panes keep their proportions
 * instead of the lower one absorbing every new pixel.
 *
 * @param {Object} chart
 * @param {number} index separator index
 * @param {number} y current pointer position
 * @param {Object} snapshot state captured when the drag began
 */
export function resizePanes(chart, index, y, snapshot) {
    const upper = chart.panes[index];
    const lower = chart.panes[index + 1];

    if (! upper || ! lower) {
        return;
    }

    const total = snapshot.upperHeight + snapshot.lowerHeight;
    const floor = minPaneHeight(chart);

    if (total < floor * 2) {
        return;
    }

    const upperHeight = Math.max(
        floor,
        Math.min(total - floor, snapshot.upperHeight + (y - snapshot.y)),
    );
    const share = snapshot.upperStretch + snapshot.lowerStretch;

    upper.stretchFactor = (share * upperHeight) / total;
    lower.stretchFactor = share - upper.stretchFactor;
}

/**
 * @param {Object} chart
 * @param {number} index separator index
 * @param {number} y
 * @return {Object}
 */
export function resizeSnapshot(chart, index, y) {
    const upper = chart.panes[index];
    const lower = chart.panes[index + 1];

    return {
        y,
        upperHeight: upper.plot.bottom - upper.plot.top,
        lowerHeight: lower.plot.bottom - lower.plot.top,
        upperStretch: upper.stretchFactor,
        lowerStretch: lower.stretchFactor,
    };
}

/**
 * Adds panes until `index` exists, then answers with it. A caller asking for
 * pane 3 of a one-pane chart means to create it, the way `addSeries(…, 3)` is
 * the only way panes ever come into being in lightweight-charts.
 *
 * @param {Object} chart
 * @param {number} index
 * @return {Object}
 */
export function ensurePane(chart, index) {
    while (chart.panes.length <= index) {
        chart.panes.push(createPane(chart, mergeOptions({}, chart.options.rightPriceScale)));
    }

    return chart.panes[index];
}

/**
 * Drops a pane and everything drawn on it. The first pane cannot be removed —
 * it owns the chart's main price scale — so its series are cleared instead.
 *
 * @param {Object} chart
 * @param {number} index
 */
export function removePane(chart, index) {
    if (index <= 0 || index >= chart.panes.length) {
        if (index === 0 && chart.panes[0]) {
            chart.panes[0].series = [];
        }

        return;
    }

    chart.panes.splice(index, 1);
}

/**
 * @param {Object} chart
 * @param {number} from
 * @param {number} to
 */
export function movePane(chart, from, to) {
    if (from === to || from < 0 || from >= chart.panes.length) {
        return;
    }

    const [pane] = chart.panes.splice(from, 1);

    chart.panes.splice(Math.max(0, Math.min(chart.panes.length, to)), 0, pane);
}

/**
 * Adds a pane and answers with its handle.
 *
 * @param {Object} chart
 * @param {number} [index] where to insert; appended when omitted
 * @return {Object}
 */
export function addPane(chart, index) {
    const pane = createPane(chart, mergeOptions({}, chart.options.rightPriceScale));

    chart.panes.splice(index ?? chart.panes.length, 0, pane);
    chart.scheduleRender();

    return paneApi(chart, pane);
}

/**
 * @param {Object} chart
 * @return {Object[]} handles for every pane, top to bottom
 */
export function paneApis(chart) {
    return chart.panes.map((pane) => paneApi(chart, pane));
}

/**
 * The handle callers get back from `chart.panes()`.
 *
 * @param {Object} chart
 * @param {Object} pane
 * @return {Object}
 */
export function paneApi(chart, pane) {
    const index = () => chart.panes.indexOf(pane);

    return {
        paneIndex: index,
        chart: () => chart.api,
        getSeries: () => pane.series.map((series) => series.api),
        getHeight: () => pane.plot.bottom - pane.plot.top,
        setHeight: (height) => {
            const others = chart.panes.filter((other) => other !== pane);
            const rest = others.reduce((sum, other) => sum + other.stretchFactor, 0);
            const remaining = Math.max(1, chart.plot.bottom - chart.plot.top - height);

            // A height only means anything relative to the others, so it is
            // stored as the stretch factor that produces it at the current size.
            pane.stretchFactor = rest > 0 ? (rest * Math.max(0, height)) / remaining : 1;
            chart.scheduleRender();
        },
        getStretchFactor: () => pane.stretchFactor,
        setStretchFactor: (factor) => {
            pane.stretchFactor = Math.max(0.01, factor);
            chart.scheduleRender();
        },
        moveTo: (target) => {
            movePane(chart, index(), target);
            chart.scheduleRender();
        },
        priceScale: (id) => chart.priceScaleApiFor(scaleRecord(pane, id)),
        attachPrimitive: (primitive) => {
            if (primitive && ! pane.primitives.includes(primitive)) {
                pane.primitives.push(primitive);

                try {
                    primitive.attached?.({ chart: chart.api, requestUpdate: () => chart.scheduleRender() });
                } catch {
                    // noop
                }

                chart.scheduleRender();
            }
        },
        detachPrimitive: (primitive) => {
            const at = pane.primitives.indexOf(primitive);

            if (at >= 0) {
                pane.primitives.splice(at, 1);

                try {
                    primitive.detached?.();
                } catch {
                    // noop
                }

                chart.scheduleRender();
            }
        },
        getHTMLElement: () => chart.element,
        _internal: pane,
    };
}
