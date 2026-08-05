import {
    chartDefaults,
    leftScaleDefaults,
    mergeOptions,
    applyLineStyle,
    CrosshairMode,
    LineStyle,
    PriceScaleMode,
} from './options.js';
import { FULL_BUILD } from './flags.js';
import { TimeScale } from './scales.js';
import {
    createPane,
    MAIN_PANE_STRETCH,
    paneDefaults,
    layoutPanes,
    paneAtY,
    separatorAt,
    drawPaneSeparators,
    resizePanes,
    resizeSnapshot,
    ensurePane,
    scaleRecord,
    paneScales,
    leftScale,
    LEFT_SCALE,
} from './panes.js';
import { toTimestamp, tickWeight, formatTick, formatCrosshairTime, TickWeight } from './time.js';
import { normalisePoint } from './series.js';
import { drawMarkers, nearestIndex } from './markers.js';
import { createRenderTarget, drawPrimitives } from './render-target.js';
import { contrastTextColor } from './colors.js';
import { trackingPoint, startKineticScroll } from './touch.js';
import { createAttributionMark } from './mark.js';

const LABEL_PADDING_X = 6;
const AXIS_PADDING = 12;
const TICK_GAP = 46;
const MIN_CLASS_SPACING = 20;
const MARKER_HEADROOM = 28;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

/**
 * Normalises a wheel delta to a -1..1 zoom step, flattening the difference
 * between pixel, line and page delta modes.
 *
 * @param {WheelEvent} event
 * @return {number}
 */
export function wheelZoomStep(event) {
    let scale = 1;

    if (event.deltaMode === WHEEL_DELTA_LINE) {
        scale = 32;
    } else if (event.deltaMode === WHEEL_DELTA_PAGE) {
        scale = 120;
    }

    const delta = -(event.deltaY / 100) * scale;

    return Math.sign(delta) * Math.min(1, Math.abs(delta));
}

/**
 * Applies a series' own `priceFormat` to a number.
 *
 * Rounding to `minMove` before fixing the decimals is what makes a tick size
 * mean anything: an instrument quoted in quarters should read 63.25 and 63.50,
 * never 63.31. Falling back to the scale's own precision keeps every series
 * that never asked for a format looking exactly as it did.
 *
 * @param {number} price
 * @param {Object} [series]
 * @param {number} fallbackPrecision
 * @return {string}
 */
export function formatWithPriceFormat(price, series, fallbackPrecision) {
    const format = series?.options?.priceFormat;

    if (! format) {
        return price.toFixed(fallbackPrecision);
    }

    const rounded = format.minMove > 0
        ? Math.round(price / format.minMove) * format.minMove
        : price;

    if (format.type === 'percent') {
        return `${rounded.toFixed(format.precision ?? 2)}%`;
    }

    if (format.type === 'volume') {
        return formatVolume(rounded);
    }

    return rounded.toFixed(format.precision ?? fallbackPrecision);
}

const VOLUME_UNITS = [
    { at: 1e9, suffix: 'B' },
    { at: 1e6, suffix: 'M' },
    { at: 1e3, suffix: 'K' },
];

function formatVolume(value) {
    const unit = VOLUME_UNITS.find((candidate) => Math.abs(value) >= candidate.at);

    return unit ? `${(value / unit.at).toFixed(2)}${unit.suffix}` : String(Math.round(value));
}

/**
 * The prices a single series occupies over the visible slice, or null when it
 * has nothing on screen.
 *
 * @param {Object} series
 * @param {number} from
 * @param {number} to
 * @return {{minValue: number, maxValue: number}|null}
 */
export function seriesPriceRange(series, from, to) {
    const barLike = series.definition.isBarLike;
    let min = Infinity;
    let max = -Infinity;

    // A histogram is read against its base, so the base belongs on the axis
    // whether or not a bar reaches it — otherwise volume bars are cut off at
    // the bottom of their own pane instead of standing on a zero line.
    if (series.options.base !== undefined) {
        min = series.options.base;
        max = series.options.base;
    }

    for (let index = from; index <= to; index++) {
        const point = series.byIndex[index];

        if (! point) {
            continue;
        }

        const low = barLike ? point.low : point.value;
        const high = barLike ? point.high : point.value;

        if (low !== null && low !== undefined && low < min) {
            min = low;
        }

        if (high !== null && high !== undefined && high > max) {
            max = high;
        }
    }

    return min === Infinity ? null : { minValue: min, maxValue: max };
}

/**
 * Hands a series' own range to its `autoscaleInfoProvider` and takes back
 * whatever that decides.
 *
 * The provider receives a function rather than the range itself, matching
 * lightweight-charts: a provider that only wants to widen the default should
 * not have to recompute it, and one that ignores the default should not pay
 * for it. Margins are fractions of the plot height, applied to the range.
 *
 * @param {Object} series
 * @param {{minValue: number, maxValue: number}} range
 * @return {{minValue: number, maxValue: number}}
 */
export function applyAutoscaleProvider(series, range) {
    let info;

    try {
        info = series.options.autoscaleInfoProvider(() => ({ priceRange: { ...range } }));
    } catch {
        return range;
    }

    const priceRange = info?.priceRange;

    if (! priceRange || ! Number.isFinite(priceRange.minValue) || ! Number.isFinite(priceRange.maxValue)) {
        return range;
    }

    const span = priceRange.maxValue - priceRange.minValue;
    const above = info.margins?.above ?? 0;
    const below = info.margins?.below ?? 0;

    return {
        minValue: priceRange.minValue - span * below,
        maxValue: priceRange.maxValue + span * above,
    };
}

const MAGNET_CLOSE = ['value'];
const MAGNET_OHLC = ['open', 'high', 'low', 'close'];

/**
 * The price a magnetised crosshair should sit at, or null to leave the pointer
 * where it is.
 *
 * Candidates are compared in pixels rather than in price, and every visible
 * series on the pane offers them — snapping to the first series instead means
 * that on a chart with a price line and a moving average, the crosshair clings
 * to the price however close the pointer gets to the average.
 *
 * @param {Object} pane
 * @param {number} index
 * @param {number} y pointer position
 * @param {number} mode
 * @return {number|null}
 */
export function magnetPrice(pane, index, y, mode) {
    if (mode !== CrosshairMode.Magnet && mode !== CrosshairMode.MagnetOHLC) {
        return null;
    }

    const keys = mode === CrosshairMode.MagnetOHLC ? MAGNET_OHLC : MAGNET_CLOSE;
    let nearest = null;
    let shortest = Infinity;

    for (const series of pane.series) {
        if (! series.options.visible) {
            continue;
        }

        const point = series.byIndex[index];

        if (! point) {
            continue;
        }

        for (const key of keys) {
            const price = point[key];

            if (price === null || price === undefined) {
                continue;
            }

            const distance = Math.abs(series.scale.priceScale.priceToY(price) - y);

            if (distance < shortest) {
                shortest = distance;
                nearest = price;
            }
        }
    }

    return nearest;
}

/**
 * Brings every view of every primitive up to date before any of them paints.
 *
 * @param {Object[]} primitives
 */
function refreshPrimitives(primitives) {
    for (const primitive of primitives) {
        try {
            primitive.updateAllViews?.();
        } catch {
            // A primitive that cannot update still gets asked to draw; it is
            // its own business whether it has anything to show.
        }
    }
}

class Series {
    constructor(chart, pane, definition, options) {
        this.chart = chart;
        this.pane = pane;
        this.definition = definition;
        this.options = mergeOptions(definition.defaults(), options ?? {});

        // Resolved once rather than looked up per frame. A series keeps the
        // same scale for life; `priceScaleId` is not an option you can change
        // later in lightweight-charts either.
        this.scale = FULL_BUILD ? scaleRecord(pane, this.options.priceScaleId) : pane;
        this.points = [];
        this.byIndex = [];
        this.markers = [];
        this.priceLines = [];
        this.primitives = [];
        this.api = this.createApi();
    }

    /**
     * Registers a primitive — an object that draws on this series' pane using
     * the chart's own coordinates and paint order.
     *
     * @param {Object} primitive
     */
    attachPrimitive(primitive) {
        if (! primitive || this.primitives.includes(primitive)) {
            return;
        }

        this.primitives.push(primitive);

        try {
            primitive.attached?.({
                chart: this.chart.api,
                series: this.api,
                requestUpdate: () => this.chart.scheduleRender(),
            });
        } catch {
            // Attaching is the primitive's own business; a failure there is
            // not a reason to leave the chart in a half-registered state.
        }

        this.chart.scheduleRender();
    }

    /**
     * @param {Object} primitive
     */
    detachPrimitive(primitive) {
        const index = this.primitives.indexOf(primitive);

        if (index < 0) {
            return;
        }

        this.primitives.splice(index, 1);

        try {
            primitive.detached?.();
        } catch {
            // noop
        }

        this.chart.scheduleRender();
    }

    /**
     * @param {Object} options
     * @return {Object} the handle the caller keeps to update or remove the line
     */
    createPriceLine(options) {
        const line = {
            options: mergeOptions({
                price: 0,
                color: '',
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                lineVisible: true,
                axisLabelVisible: true,
                title: '',
                axisLabelColor: '',
                axisLabelTextColor: '',
            }, options ?? {}),
        };

        line.api = {
            applyOptions: (next) => {
                mergeOptions(line.options, next ?? {});
                this.chart.scheduleRender();
            },
            options: () => line.options,
            _line: line,
        };

        this.priceLines.push(line);
        this.chart.scheduleRender();

        return line.api;
    }

    removePriceLine(handle) {
        const index = this.priceLines.findIndex((line) => line.api === handle || line === handle);

        if (index >= 0) {
            this.priceLines.splice(index, 1);
            this.chart.scheduleRender();
        }
    }

    /**
     * The handle the caller holds.
     *
     * Annotated rather than inferred: the returned object closes over `this`,
     * and from TypeScript 5.9 a declaration that references an inaccessible
     * `this` type is an error rather than a widening. The public shape is
     * described in `types.js` regardless, so nothing is lost by saying so here.
     *
     * @return {Object}
     */
    createApi() {
        const series = this;

        return {
            seriesType: () => series.definition.type,
            setData: (data) => {
                series.setData(data);
                series.chart.dataChanged();
            },
            update: (point) => {
                series.update(point);
                series.chart.dataChanged();
            },
            data: () => series.points.map((point) => point.raw),
            applyOptions: (options) => {
                mergeOptions(series.options, options ?? {});
                series.chart.scheduleRender();
            },
            options: () => series.options,
            setMarkers: (markers) => {
                series.markers = Array.isArray(markers) ? markers : [];
                series.chart.scheduleRender();
            },
            attachPrimitive: (primitive) => series.attachPrimitive(primitive),
            detachPrimitive: (primitive) => series.detachPrimitive(primitive),
            createPriceLine: (options) => series.createPriceLine(options),
            removePriceLine: (handle) => series.removePriceLine(handle),
            priceLines: () => series.priceLines.map((line) => line.api),
            markers: () => series.markers,
            priceScale: () => series.chart.priceScaleApiFor(series.scale),
            priceToCoordinate: (price) => {
                series.chart.ensureLayout();

                return series.scale.priceScale.priceToY(price);
            },
            coordinateToPrice: (y) => {
                series.chart.ensureLayout();

                return series.scale.priceScale.yToPrice(y);
            },
            _internal: series,
        };
    }

    setData(data) {
        const points = [];

        for (const item of Array.isArray(data) ? data : []) {
            const timestamp = toTimestamp(item.time);

            if (timestamp === null) {
                continue;
            }

            points.push(normalisePoint(item, timestamp));
        }

        points.sort((a, b) => a.ts - b.ts);

        // A custom series has no scalar value of its own: its prices come from
        // the view that draws it. Reading them once here is what lets the axis,
        // the price line and the last-value badge treat it like any other
        // series instead of each having to know about custom views.
        if (FULL_BUILD && this.definition.priceValues) {
            for (const point of points) {
                const values = this.definition.priceValues(point.raw);

                point.value = values.length ? values[values.length - 1] : null;
                point.low = values.length ? Math.min(...values) : null;
                point.high = values.length ? Math.max(...values) : null;
            }
        }

        this.points = points;
    }

    update(item) {
        const timestamp = toTimestamp(item.time);

        if (timestamp === null) {
            return;
        }

        const point = normalisePoint(item, timestamp);
        const last = this.points[this.points.length - 1];

        if (last && last.ts === timestamp) {
            this.points[this.points.length - 1] = point;

            return;
        }

        if (! last || timestamp > last.ts) {
            this.points.push(point);

            return;
        }

        const index = this.points.findIndex((existing) => existing.ts >= timestamp);

        if (index >= 0 && this.points[index].ts === timestamp) {
            this.points[index] = point;
        } else {
            this.points.splice(index < 0 ? this.points.length : index, 0, point);
        }
    }

    lastPoint() {
        for (let index = this.points.length - 1; index >= 0; index--) {
            const point = this.points[index];

            if (point.value !== null && point.value !== undefined) {
                return point;
            }
        }

        return null;
    }
}

export class Chart {
    constructor(container, options) {
        this.container = container;
        this.options = mergeOptions(
            chartDefaults(),
            FULL_BUILD
                ? {
                    layout: { panes: paneDefaults() },
                    leftPriceScale: leftScaleDefaults(),
                    trackingMode: { exitMode: 'onTouchEnd' },
                    kineticScroll: { touch: true, mouse: false },
                }
                : {},
        );
        mergeOptions(this.options, options ?? {});
        this.timeIndex = [];
        this.timeScale = new TimeScale(this.options.timeScale);
        this.panes = [createPane(this, this.options.rightPriceScale, MAIN_PANE_STRETCH)];
        this.plot = { left: 0, top: 0, right: 0, bottom: 0 };
        this.crosshairHandlers = new Set();
        this.clickHandlers = new Set();
        this.logicalRangeHandlers = new Set();
        this.timeRangeHandlers = new Set();
        this.lastLogicalRange = null;
        this.autoFit = false;
        this.layoutDirty = true;
        this.priceAxisWidth = 0;
        this.leftAxisWidth = 0;
        this.renderHandle = null;
        this.crosshair = null;
        this.hoveredSeparator = -1;
        this.pointer = {
            mode: null,
            snapshot: null,
            pane: null,
            separator: -1,
            lastX: 0,
            startX: 0,
            startY: 0,
            moved: false,
            pinchDistance: 0,
            lastTouchAt: 0,
            touchSpeed: 0,
        };

        this.buildDom();
        this.applySize(this.options.width, this.options.height);
        this.bindEvents();
        this.scheduleRender();
    }

    buildDom() {
        this.element = document.createElement('div');
        this.element.className = 'arincen-chart-root';
        this.element.style.cssText = 'position:relative;overflow:hidden;';

        this.mainCanvas = document.createElement('canvas');
        this.mainCanvas.style.cssText = 'position:absolute;inset:0;display:block;';

        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.cssText = 'position:absolute;inset:0;display:block;';

        this.element.appendChild(this.mainCanvas);
        this.element.appendChild(this.overlayCanvas);
        this.container.appendChild(this.element);

        this.mainCtx = this.mainCanvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.updateAttribution();
    }

    /**
     * Adds or removes the attribution mark to match the current options.
     */
    updateAttribution() {
        const wanted = this.options.layout.attributionLogo;

        if (wanted && ! this.attributionMark) {
            this.attributionMark = createAttributionMark(this.element, this.options.layout);
        } else if (! wanted && this.attributionMark) {
            this.attributionMark.remove();
            this.attributionMark = null;
        }
    }

    applySize(width, height) {
        const rect = this.container.getBoundingClientRect();

        this.width = Math.max(0, Math.floor(width || rect.width || this.container.clientWidth));
        this.height = Math.max(0, Math.floor(height || rect.height || this.container.clientHeight));

        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;

        const ratio = window.devicePixelRatio || 1;

        for (const canvas of [this.mainCanvas, this.overlayCanvas]) {
            canvas.width = Math.floor(this.width * ratio);
            canvas.height = Math.floor(this.height * ratio);
            canvas.style.width = `${this.width}px`;
            canvas.style.height = `${this.height}px`;
            canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
        }
    }

    startAutoSize() {
        if (this.resizeObserver || typeof ResizeObserver === 'undefined') {
            return;
        }

        this.resizeObserver = new ResizeObserver(() => {
            this.applySize(0, 0);
            this.scheduleRender();
        });

        this.resizeObserver.observe(this.container);
    }

    /* ---------------------------------------------------------------- data */

    /**
     * Takes a series definition object, never a name.
     *
     * Resolving names would mean holding a map of every series here, which
     * pins all of them into any bundle that draws a chart — a page showing one
     * area chart would still ship the candlestick and histogram renderers.
     *
     * @param {Object} definition
     * @param {Object} [options]
     * @param {number} [paneIndex] full build only; panes are created on demand
     */
    addSeries(definition, options, paneIndex) {
        if (! definition || typeof definition.defaults !== 'function') {
            throw new Error(
                'addSeries expects a series definition. Import the one you need '
                + '(AreaSeries, LineSeries, CandlestickSeries, BarSeries, HistogramSeries) and pass it directly.',
            );
        }

        const pane = FULL_BUILD && paneIndex > 0 ? ensurePane(this, paneIndex) : this.panes[0];
        const series = new Series(this, pane, definition, options);

        pane.series.push(series);
        this.dataChanged();

        return series.api;
    }

    removeSeries(seriesApi) {
        for (const pane of this.panes) {
            const index = pane.series.findIndex((series) => series.api === seriesApi);

            if (index >= 0) {
                pane.series.splice(index, 1);
                this.dataChanged();

                return;
            }
        }
    }

    /**
     * Every series on the chart, in pane order. Pane-scoped drawing uses
     * `pane.series` directly; this is for the chart-wide passes — building the
     * shared time index, answering a crosshair — which do not care where a
     * series is drawn.
     *
     * @return {Series[]}
     */
    get allSeries() {
        return this.panes.length === 1
            ? this.panes[0].series
            : this.panes.flatMap((pane) => pane.series);
    }

    /**
     * Rebuilds the merged time index every series is positioned against, then
     * maps each series' points onto it.
     */
    dataChanged() {
        const all = this.allSeries;
        const timestamps = new Set();

        for (const series of all) {
            for (const point of series.points) {
                timestamps.add(point.ts);
            }
        }

        this.timeIndex = Array.from(timestamps).sort((a, b) => a - b);

        const position = new Map();

        this.timeIndex.forEach((timestamp, index) => position.set(timestamp, index));

        for (const series of all) {
            series.byIndex = new Array(this.timeIndex.length);

            for (const point of series.points) {
                series.byIndex[position.get(point.ts)] = point;
            }
        }

        this.timeScale.setPoints(this.timeIndex);
        this.timeScale.padBars = all.some((series) => series.definition.isBarLike) ? 0.5 : 0;
        this.scheduleRender();
    }

    /* ------------------------------------------------------------- rendering */

    scheduleRender() {
        this.layoutDirty = true;

        if (this.renderHandle !== null || this.removed) {
            return;
        }

        this.renderHandle = requestAnimationFrame(() => {
            this.renderHandle = null;
            this.render();
        });
    }

    layout() {
        const { layout, timeScale: timeScaleOptions } = this.options;
        const timeAxisHeight = timeScaleOptions.visible ? layout.fontSize + 14 : 0;

        this.plot = {
            left: FULL_BUILD ? Math.min(this.leftAxisWidth, this.width) : 0,
            top: 0,
            right: Math.max(0, this.width - this.priceAxisWidth),
            bottom: Math.max(0, this.height - timeAxisHeight),
        };

        this.timeScale.width = Math.max(0, this.plot.right - this.plot.left);

        if (FULL_BUILD && this.panes.length > 1) {
            layoutPanes(this);
        } else {
            this.panes[0].plot = { ...this.plot };
        }

        for (const pane of this.panes) {
            pane.priceScale.setViewport(pane.plot.top, pane.plot.bottom);

            if (FULL_BUILD && pane.extraScales) {
                for (const record of pane.extraScales.values()) {
                    record.priceScale.setViewport(pane.plot.top, pane.plot.bottom);
                }
            }
        }

        if (this.autoFit) {
            this.timeScale.fitContent();
        } else {
            this.timeScale.clampToEdges();
        }

        for (const pane of this.panes) {
            if (FULL_BUILD) {
                for (const record of paneScales(pane)) {
                    this.updatePriceRange(pane, record);
                }
            } else {
                this.updatePriceRange(pane, pane);
            }
        }
    }

    /**
     * @param {Object} pane the pane whose height the scale spans
     * @param {Object} record the scale being ranged, which may be the pane itself
     */
    updatePriceRange(pane, record) {
        // A scale is ranged against the series drawn on it, not on everything
        // in the pane — that separation is the whole point of a second scale.
        const scaled = FULL_BUILD
            ? pane.series.filter((series) => series.scale === record)
            : pane.series;

        if (FULL_BUILD && record.options.mode >= PriceScaleMode.Percentage) {
            const { from } = this.timeScale.visibleIndices();
            const first = scaled
                .map((series) => series.byIndex[from])
                .find((point) => point && point.value !== null && point.value !== undefined);

            record.priceScale.percentageBase = first ? first.value : null;
        }

        if (! record.autoScale && record.manualRange) {
            record.priceScale.setRange(record.manualRange.min, record.manualRange.max);

            return;
        }

        const { from, to } = this.timeScale.visibleIndices();

        let min = Infinity;
        let max = -Infinity;

        for (const series of scaled) {
            if (! series.options.visible) {
                continue;
            }

            const range = seriesPriceRange(series, from, to);

            if (! range) {
                continue;
            }

            const adjusted = FULL_BUILD && typeof series.options.autoscaleInfoProvider === 'function'
                ? applyAutoscaleProvider(series, range)
                : range;

            min = Math.min(min, adjusted.minValue);
            max = Math.max(max, adjusted.maxValue);
        }

        if (min === Infinity) {
            record.priceScale.setRange(0, 1);

            return;
        }

        // Markers hang above and below their bar, so the range has to reserve
        // room for them or an arrow on the highest bar is clipped away.
        const plotHeight = pane.plot.bottom - pane.plot.top;

        if (scaled.some((series) => series.markers.length) && plotHeight > 0) {
            const headroom = (max - min) * (MARKER_HEADROOM / plotHeight);

            min -= headroom;
            max += headroom;
        }

        record.priceScale.setRange(min, max);
    }

    font() {
        return `${this.options.layout.fontSize}px ${this.options.layout.fontFamily}`;
    }

    /**
     * @param {number} price
     * @param {Object} pane
     * @param {Object} [series] the series this price belongs to, when it has one
     */
    formatPrice(price, scale, series) {
        if (FULL_BUILD && scale.options.mode >= PriceScaleMode.Percentage) {
            const base = scale.priceScale.percentageBase;

            if (base) {
                // The axis is a move, not a price, so a caller's price
                // formatter — currency symbols and all — would be wrong here.
                return scale.options.mode === PriceScaleMode.Percentage
                    ? `${((price / base - 1) * 100).toFixed(2)}%`
                    : ((price / base) * 100).toFixed(2);
            }
        }

        const formatter = this.options.localization.priceFormatter;

        if (typeof formatter === 'function') {
            return formatter(price);
        }

        return formatWithPriceFormat(price, series ?? scale.series?.[0], scale.priceScale.precision());
    }

    /**
     * Brings the scales up to date without painting.
     *
     * Rendering is deferred to an animation frame, so anything asked before the
     * first paint — `priceToCoordinate` on a series, a visible range — would
     * otherwise be answered from an unmeasured scale and come back as zero. A
     * caller reading coordinates straight after `setData` has every right to a
     * real answer.
     */
    ensureLayout() {
        if (! this.layoutDirty || ! this.width || ! this.height || this.removed) {
            return;
        }

        this.layout();

        const ctx = this.mainCtx;

        ctx.font = this.font();

        // One axis column serves every pane, so it is measured against the
        // widest label any of them will print — otherwise the panes would
        // disagree on where the plot ends and the grid would step sideways.
        const widest = (records) => records.reduce((width, record) => record.priceScale.ticks().reduce(
            (widestLabel, tick) => Math.max(widestLabel, ctx.measureText(this.formatPrice(tick.price, record)).width),
            width,
        ), 0);

        const gutter = (records, options) => (options.visible
            ? Math.max(Math.ceil(widest(records)) + AXIS_PADDING, options.minimumWidth ?? 0)
            : 0);

        const desiredWidth = gutter(this.panes, this.options.rightPriceScale);
        const lefts = FULL_BUILD ? this.panes.map(leftScale).filter(Boolean) : [];
        const desiredLeft = FULL_BUILD && lefts.length
            ? gutter(lefts, this.options.leftPriceScale)
            : 0;

        // The axis width depends on the labels, which depend on the plot width,
        // which depends on the axis width — one correction settles it.
        if (Math.abs(desiredWidth - this.priceAxisWidth) > 0.5
            || (FULL_BUILD && Math.abs(desiredLeft - this.leftAxisWidth) > 0.5)) {
            this.priceAxisWidth = desiredWidth;
            this.leftAxisWidth = desiredLeft;
            this.layout();
        }

        this.layoutDirty = false;
    }

    render() {
        if (! this.width || ! this.height || this.removed) {
            return;
        }

        this.layoutDirty = true;
        this.ensureLayout();

        const ctx = this.mainCtx;
        const timeTicks = this.buildTimeTicks(ctx);
        const paneTicks = this.panes.map((pane) => pane.priceScale.ticks());

        this.drawBackground(ctx);
        this.drawGrid(ctx, paneTicks, timeTicks);

        this.panes.forEach((pane, index) => {
            this.drawSeries(ctx, pane);
            this.drawPriceAxis(ctx, pane, pane, paneTicks[index]);

            if (FULL_BUILD) {
                const left = leftScale(pane);

                if (left) {
                    this.drawPriceAxis(ctx, pane, left, left.priceScale.ticks(), true);
                }
            }
        });

        this.drawTimeAxis(ctx, timeTicks);
        this.emitVisibleRange();

        if (FULL_BUILD && this.panes.length > 1) {
            drawPaneSeparators(ctx, this, this.hoveredSeparator);
        }

        this.drawCrosshair();
    }

    /**
     * Tells subscribers when the viewport has moved.
     *
     * Emitted after layout rather than from the gestures themselves: a range
     * changes from panning, zooming, a resize, `fitContent`, and new data
     * arriving, and only one of those is a gesture. Paging in older bars — the
     * usual reason to listen — has to hear about all of them.
     */
    emitVisibleRange() {
        if (! this.logicalRangeHandlers.size && ! this.timeRangeHandlers.size) {
            return;
        }

        const range = this.timeIndex.length ? this.timeScale.logicalRange() : null;
        const last = this.lastLogicalRange;
        const same = range && last
            ? Math.abs(range.from - last.from) < 1e-9 && Math.abs(range.to - last.to) < 1e-9
            : range === last;

        if (same) {
            return;
        }

        this.lastLogicalRange = range;

        for (const handler of this.logicalRangeHandlers) {
            handler(range);
        }

        if (this.timeRangeHandlers.size) {
            const { from, to } = this.timeScale.visibleIndices();
            const times = to < from ? null : { from: this.timeIndex[from], to: this.timeIndex[to] };

            for (const handler of this.timeRangeHandlers) {
                handler(times);
            }
        }
    }

    drawBackground(ctx) {
        const { background } = this.options.layout;

        ctx.clearRect(0, 0, this.width, this.height);

        if (background.type === 'gradient') {
            const gradient = ctx.createLinearGradient(0, 0, 0, this.height);

            gradient.addColorStop(0, background.topColor);
            gradient.addColorStop(1, background.bottomColor);
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = background.color;
        }

        ctx.fillRect(0, 0, this.width, this.height);
    }

    drawGrid(ctx, paneTicks, timeTicks) {
        const { vertLines, horzLines } = this.options.grid;

        ctx.save();
        ctx.lineWidth = 1;

        if (horzLines.visible) {
            ctx.strokeStyle = horzLines.color;
            applyLineStyle(ctx, horzLines.style, 1);
            ctx.beginPath();

            for (const ticks of paneTicks) {
                for (const tick of ticks) {
                    const y = Math.round(tick.y) + 0.5;

                    ctx.moveTo(this.plot.left, y);
                    ctx.lineTo(this.plot.right, y);
                }
            }

            ctx.stroke();
        }

        if (vertLines.visible) {
            ctx.strokeStyle = vertLines.color;
            applyLineStyle(ctx, vertLines.style, 1);
            ctx.beginPath();

            for (const tick of timeTicks) {
                const x = Math.round(tick.x) + 0.5;

                ctx.moveTo(x, this.plot.top);
                ctx.lineTo(x, this.plot.bottom);
            }

            ctx.stroke();
        }

        ctx.restore();
    }

    drawSeries(ctx, pane) {
        const { from, to } = this.timeScale.visibleIndices();
        const pixelRatio = window.devicePixelRatio || 1;
        const target = createRenderTarget(ctx, { width: this.width, height: this.height }, pixelRatio);
        const plot = pane.plot;

        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
        ctx.clip();

        if (FULL_BUILD) {
            refreshPrimitives(pane.primitives);
            drawPrimitives(pane.primitives, 'bottom', target);
        }

        for (const series of pane.series) {
            if (! series.options.visible) {
                continue;
            }

            const context = {
                series,
                options: series.options,
                priceScale: series.scale.priceScale,
                timeScale: this.timeScale,
                timeIndex: this.timeIndex,
                plot,
                font: this.font(),
                pixelRatio,
                target,
                from,
                to,
            };

            // Views are refreshed once per frame, before anything is asked to
            // paint, so every layer of one primitive sees the same state.
            refreshPrimitives(series.primitives);

            drawPrimitives(series.primitives, 'bottom', target);
            series.definition.draw(ctx, context);
            drawPrimitives(series.primitives, 'normal', target);
            drawMarkers(ctx, context);

            if (series.options.priceLineVisible) {
                this.drawPriceLine(ctx, pane, series);
            }

            this.drawCustomPriceLines(ctx, pane, series);
            drawPrimitives(series.primitives, 'top', target);
        }

        if (FULL_BUILD) {
            drawPrimitives(pane.primitives, 'normal', target);
            drawPrimitives(pane.primitives, 'top', target);
        }

        ctx.restore();
    }

    /**
     * Lines the caller pinned at a price — alerts, targets, entries. Drawn with
     * the series so they stay clipped to the plot; their axis badges are drawn
     * later with the price scale.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} pane
     * @param {Series} series
     */
    drawCustomPriceLines(ctx, pane, series) {
        for (const line of series.priceLines) {
            const { price, color, lineWidth, lineStyle, lineVisible, title } = line.options;

            if (! lineVisible || ! Number.isFinite(price)) {
                continue;
            }

            const y = Math.round(series.scale.priceScale.priceToY(price)) + 0.5;

            if (y < pane.plot.top || y > pane.plot.bottom) {
                continue;
            }

            ctx.save();
            ctx.strokeStyle = color || this.options.layout.textColor;
            ctx.lineWidth = lineWidth;
            applyLineStyle(ctx, lineStyle, lineWidth);
            ctx.beginPath();
            ctx.moveTo(pane.plot.left, y);
            ctx.lineTo(pane.plot.right, y);
            ctx.stroke();
            ctx.setLineDash([]);

            if (title) {
                ctx.font = this.font();
                ctx.fillStyle = color || this.options.layout.textColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(title, pane.plot.left + LABEL_PADDING_X, y - 3);
            }

            ctx.restore();
        }
    }

    drawPriceLine(ctx, pane, series) {
        const point = series.lastPoint();

        if (! point) {
            return;
        }

        const y = Math.round(series.scale.priceScale.priceToY(point.value)) + 0.5;

        ctx.save();
        ctx.strokeStyle = series.options.priceLineColor
            || series.definition.lastValueColor(series.options, point);
        ctx.lineWidth = series.options.priceLineWidth;
        applyLineStyle(ctx, series.options.priceLineStyle, series.options.priceLineWidth);
        ctx.beginPath();
        ctx.moveTo(pane.plot.left, y);
        ctx.lineTo(pane.plot.right, y);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} pane
     * @param {Object} record the scale this axis belongs to
     * @param {{price: number, y: number}[]} ticks
     * @param {boolean} [onLeft]
     */
    drawPriceAxis(ctx, pane, record, ticks, onLeft) {
        if (! record.options.visible) {
            return;
        }

        const { borderVisible, borderColor } = record.options;
        const badges = this.collectAxisBadges(pane, record);
        const badgeHeight = this.options.layout.fontSize + 6;
        const edge = onLeft ? this.plot.left : this.plot.right;

        ctx.save();
        ctx.font = this.font();
        ctx.textAlign = onLeft ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.options.layout.textColor;

        // A pane below another has a hard edge at its top, and a label centred
        // on that edge spills into the pane above — where it reads as that
        // pane's number. The margin is half the glyph box, not half the badge:
        // a badge carries padding a bare tick label does not, and charging the
        // label for it costs the topmost tick of every lower pane.
        const topLimit = FULL_BUILD && pane.plot.top > this.plot.top
            ? pane.plot.top + this.options.layout.fontSize / 2
            : pane.plot.top;

        for (const tick of ticks) {
            if (tick.y < topLimit || tick.y > pane.plot.bottom) {
                continue;
            }

            // A badge is painted over the axis, so a tick label behind one is
            // only ever half-legible. Drop it rather than let it show through.
            const hidden = badges.some((badge) => Math.abs(badge.y - tick.y) < badgeHeight);

            if (hidden) {
                continue;
            }

            ctx.fillText(
                this.formatPrice(tick.price, record),
                onLeft ? edge - LABEL_PADDING_X : edge + LABEL_PADDING_X,
                tick.y,
            );
        }

        if (borderVisible) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.round(edge) + 0.5, pane.plot.top);
            ctx.lineTo(Math.round(edge) + 0.5, pane.plot.bottom);
            ctx.stroke();
        }

        for (const badge of badges) {
            if (badge.title) {
                this.drawSeriesTitleTag(ctx, pane, badge.title, badge.y, badge.background);
            }

            this.drawAxisBadge(ctx, pane, badge.text, badge.y, badge.background, badge.textColor, onLeft);
        }

        ctx.restore();
    }

    /**
     * Every label the price axis will paint over itself — last values first,
     * then the caller's price lines.
     *
     * @return {{y: number, text: string, background: string, textColor: (string|undefined), title: string}[]}
     */
    collectAxisBadges(pane, record) {
        const badges = [];
        const drawn = FULL_BUILD
            ? pane.series.filter((series) => series.scale === record)
            : pane.series;

        // Price lines first so the last value paints over them: when an alert
        // sits close to the current price, the live number is the one that has
        // to stay readable.
        for (const series of drawn) {
            for (const line of series.priceLines) {
                const { price, color, axisLabelVisible, axisLabelColor, axisLabelTextColor } = line.options;

                if (! axisLabelVisible || ! Number.isFinite(price)) {
                    continue;
                }

                const y = record.priceScale.priceToY(price);

                // A label clamped to the edge would claim the axis reaches a
                // price it does not; off-scale lines simply have no label.
                if (y < pane.plot.top || y > pane.plot.bottom) {
                    continue;
                }

                badges.push({
                    y,
                    text: this.formatPrice(price, record, series),
                    background: axisLabelColor || color || this.options.layout.textColor,
                    textColor: axisLabelTextColor || undefined,
                    title: '',
                });
            }
        }

        for (const series of drawn) {
            if (! series.options.visible || ! series.options.lastValueVisible) {
                continue;
            }

            const point = series.lastPoint();

            if (! point) {
                continue;
            }

            badges.push({
                y: record.priceScale.priceToY(point.value),
                text: this.formatPrice(point.value, record, series),
                background: series.definition.lastValueColor(series.options, point),
                textColor: undefined,
                title: series.options.title,
            });
        }

        return badges;
    }

    /**
     * A named series carries its name on a tag butted against the inside edge
     * of the price axis, so it reads as one label with the last-value badge.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} pane
     * @param {string} title
     * @param {number} y
     * @param {string} background
     */
    drawSeriesTitleTag(ctx, pane, title, y, background) {
        if (! title) {
            return;
        }

        const height = this.options.layout.fontSize + 6;
        const top = Math.max(pane.plot.top, Math.min(pane.plot.bottom - height, y - height / 2));
        const width = ctx.measureText(title).width + LABEL_PADDING_X * 2;
        const left = Math.max(pane.plot.left, pane.plot.right - width);

        ctx.fillStyle = background;
        ctx.fillRect(left, top, pane.plot.right - left, height);
        ctx.fillStyle = contrastTextColor(background);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, left + LABEL_PADDING_X, top + height / 2);
    }

    drawAxisBadge(ctx, pane, text, y, background, textColor, onLeft) {
        const height = this.options.layout.fontSize + 6;
        const top = Math.max(pane.plot.top, Math.min(pane.plot.bottom - height, y - height / 2));
        const left = onLeft ? 0 : this.plot.right + 1;
        const width = onLeft ? Math.max(0, this.plot.left - 1) : this.priceAxisWidth - 1;

        ctx.fillStyle = background;
        ctx.fillRect(left, top, width, height);
        ctx.fillStyle = textColor ?? contrastTextColor(background);
        ctx.textAlign = onLeft ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, onLeft ? left + width - LABEL_PADDING_X : left + LABEL_PADDING_X - 1, top + height / 2);
    }

    /**
     * Picks axis ticks highest-significance-first so year and month boundaries
     * win the available room, then fills the gaps with lesser ticks.
     *
     * Finer classes are dropped wholesale once their own bars sit closer than
     * `MIN_CLASS_SPACING`: a year of daily bars should read as months, not as
     * month names with stray day numbers wedged between them.
     *
     * @return {{x: number, label: string}[]}
     */
    buildTimeTicks(ctx) {
        if (! this.options.timeScale.visible || ! this.timeIndex.length) {
            return [];
        }

        const { from, to } = this.timeScale.visibleIndices();

        if (to < from) {
            return [];
        }

        const spanSeconds = this.timeIndex[to] - this.timeIndex[from];
        const locale = this.options.localization.locale;
        const allowIntraday = this.options.timeScale.timeVisible;
        const candidates = [];
        const perClassCount = new Map();

        ctx.font = this.font();

        // A series that never crosses midnight — the intraday tab — has no
        // tick above hour weight to offer. Dropping those would leave the axis
        // blank, so the time-of-day labels stand in.
        const weights = [];

        for (let index = from; index <= to; index++) {
            weights.push(tickWeight(this.timeIndex[index], index > 0 ? this.timeIndex[index - 1] : null));
        }

        const hasDayBoundary = weights.some((weight, position) => (
            weight >= TickWeight.Day && position > 0
        ));
        const skipIntraday = ! allowIntraday && hasDayBoundary;

        for (let index = from; index <= to; index++) {
            const timestamp = this.timeIndex[index];
            const weight = weights[index - from];

            if (skipIntraday && weight < TickWeight.Day) {
                continue;
            }

            const label = formatTick(timestamp, weight, { locale, spanSeconds });

            perClassCount.set(weight, (perClassCount.get(weight) ?? 0) + 1);

            // Measured bold throughout: the lead ticks render bold, and the
            // wider measurement keeps the collision test on the safe side.
            ctx.font = `bold ${this.font()}`;

            candidates.push({
                x: this.timeScale.indexToX(index),
                width: ctx.measureText(label).width,
                weight,
                index,
                label,
            });
        }

        const plotWidth = this.plot.right - this.plot.left;
        let finestWeight = TickWeight.Year;

        for (const [weight, count] of perClassCount) {
            if (count > 0 && plotWidth / count >= MIN_CLASS_SPACING) {
                finestWeight = Math.min(finestWeight, weight);
            }
        }

        const accepted = [];

        candidates
            .filter((candidate) => candidate.weight >= finestWeight)
            .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
            .forEach((candidate) => {
                const half = candidate.width / 2;

                if (candidate.x - half < this.plot.left || candidate.x + half > this.plot.right) {
                    return;
                }

                const collides = accepted.some((tick) => (
                    Math.abs(tick.x - candidate.x) < (tick.width + candidate.width) / 2 + TICK_GAP
                ));

                if (! collides) {
                    accepted.push(candidate);
                }
            });

        return accepted.sort((a, b) => a.x - b.x);
    }

    drawTimeAxis(ctx, ticks) {
        if (! this.options.timeScale.visible) {
            return;
        }

        const { borderVisible, borderColor } = this.options.timeScale;

        ctx.save();
        ctx.font = this.font();
        ctx.fillStyle = this.options.layout.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // The coarsest boundary on screen is the one that orients the reader,
        // so it carries the weight — the year among months, the hour among
        // minutes.
        const leadWeight = ticks.reduce((highest, tick) => Math.max(highest, tick.weight), 0);

        for (const tick of ticks) {
            ctx.font = tick.weight === leadWeight ? `bold ${this.font()}` : this.font();
            ctx.fillText(tick.label, tick.x, this.plot.bottom + 6);
        }

        ctx.font = this.font();

        if (borderVisible) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.plot.left, Math.round(this.plot.bottom) + 0.5);
            ctx.lineTo(this.plot.right, Math.round(this.plot.bottom) + 0.5);
            ctx.stroke();
        }

        ctx.restore();
    }

    /* ------------------------------------------------------------ crosshair */

    drawCrosshair() {
        const ctx = this.overlayCtx;

        ctx.clearRect(0, 0, this.width, this.height);

        const { mode, vertLine, horzLine } = this.options.crosshair;

        if (! this.crosshair || mode === CrosshairMode.Hidden) {
            return;
        }

        const { index, y, pane } = this.crosshair;
        const x = this.timeScale.indexToX(index);

        ctx.save();
        ctx.font = this.font();

        // The vertical line runs the whole height — the same bar is under the
        // cursor in every pane. The horizontal one is a price, which only means
        // something on the scale it was read from, so it stays in its pane.
        if (vertLine.visible) {
            ctx.strokeStyle = vertLine.color;
            ctx.lineWidth = vertLine.width;
            applyLineStyle(ctx, vertLine.style, vertLine.width);
            ctx.beginPath();
            ctx.moveTo(Math.round(x) + 0.5, this.plot.top);
            ctx.lineTo(Math.round(x) + 0.5, this.plot.bottom);
            ctx.stroke();
        }

        if (horzLine.visible) {
            ctx.strokeStyle = horzLine.color;
            ctx.lineWidth = horzLine.width;
            applyLineStyle(ctx, horzLine.style, horzLine.width);
            ctx.beginPath();
            ctx.moveTo(pane.plot.left, Math.round(y) + 0.5);
            ctx.lineTo(pane.plot.right, Math.round(y) + 0.5);
            ctx.stroke();
        }

        ctx.setLineDash([]);
        this.drawCrosshairMarkers(ctx, pane, index);

        if (horzLine.visible && horzLine.labelVisible && this.options.rightPriceScale.visible) {
            this.drawAxisBadge(
                ctx,
                pane,
                this.formatPrice(pane.priceScale.yToPrice(y), pane),
                y,
                horzLine.labelBackgroundColor,
            );
        }

        // The same height is a different price on each scale, so a chart with
        // two axes needs the reading twice — one label would be right for half
        // the series and quietly wrong for the rest.
        if (FULL_BUILD && horzLine.visible && horzLine.labelVisible) {
            const left = leftScale(pane);

            if (left && left.options.visible) {
                this.drawAxisBadge(
                    ctx,
                    pane,
                    this.formatPrice(left.priceScale.yToPrice(y), left),
                    y,
                    horzLine.labelBackgroundColor,
                    undefined,
                    true,
                );
            }
        }

        if (vertLine.visible && vertLine.labelVisible && this.options.timeScale.visible) {
            this.drawTimeBadge(ctx, x, this.timeIndex[index]);
        }

        ctx.restore();
    }

    drawCrosshairMarkers(ctx, pane, index) {
        for (const series of pane.series) {
            if (! series.options.visible || ! series.options.crosshairMarkerVisible) {
                continue;
            }

            if (series.definition.isBarLike) {
                continue;
            }

            const point = series.byIndex[index];

            if (! point || point.value === null || point.value === undefined) {
                continue;
            }

            const colour = series.definition.lastValueColor(series.options, point);

            ctx.beginPath();
            ctx.arc(
                this.timeScale.indexToX(index),
                pane.priceScale.priceToY(point.value),
                series.options.crosshairMarkerRadius,
                0,
                Math.PI * 2,
            );
            ctx.fillStyle = series.options.crosshairMarkerBackgroundColor || colour;
            ctx.fill();
            ctx.lineWidth = series.options.crosshairMarkerBorderWidth;
            ctx.strokeStyle = series.options.crosshairMarkerBorderColor
                || this.options.layout.background.color;
            ctx.stroke();
        }
    }

    drawTimeBadge(ctx, x, timestamp) {
        if (timestamp === undefined) {
            return;
        }

        const intraday = this.options.timeScale.timeVisible;
        const formatter = this.options.localization.timeFormatter;

        // Declared in the options since the first commit and never read until
        // now: a caller setting it got silence, which is worse than not
        // offering it at all.
        const label = typeof formatter === 'function'
            ? formatter(timestamp)
            : formatCrosshairTime(timestamp, {
                locale: this.options.localization.locale,
                intraday,
            });
        const width = ctx.measureText(label).width + AXIS_PADDING;
        const height = this.options.layout.fontSize + 8;
        const left = Math.max(0, Math.min(this.plot.right - width, x - width / 2));
        const background = this.options.crosshair.vertLine.labelBackgroundColor;

        ctx.fillStyle = background;
        ctx.fillRect(left, this.plot.bottom + 1, width, height);
        ctx.fillStyle = contrastTextColor(background);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, left + width / 2, this.plot.bottom + 1 + height / 2);
    }

    /* --------------------------------------------------------------- events */

    bindEvents() {
        this.onPointerMove = (event) => this.handlePointerMove(event);
        this.onPointerLeave = () => this.handlePointerLeave();
        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerUp = (event) => this.handlePointerUp(event);
        this.onDragMove = (event) => this.handleDragMove(event);
        this.onDoubleClick = (event) => this.handleDoubleClick(event);
        this.onWheel = (event) => this.handleWheel(event);
        this.onTouchStart = (event) => this.handleTouchStart(event);
        this.onTouchMove = (event) => this.handleTouchMove(event);
        this.onTouchEnd = () => this.handleTouchEnd();

        this.element.addEventListener('mousemove', this.onPointerMove);
        this.element.addEventListener('mouseleave', this.onPointerLeave);
        this.element.addEventListener('mousedown', this.onPointerDown);
        this.element.addEventListener('dblclick', this.onDoubleClick);

        // Drags are tracked on the window so a gesture that runs off the axis —
        // or off the chart entirely — keeps scaling until the button is let go.
        window.addEventListener('mousemove', this.onDragMove);
        window.addEventListener('mouseup', this.onPointerUp);

        this.element.addEventListener('wheel', this.onWheel, { passive: false });
        this.element.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.element.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.element.addEventListener('touchend', this.onTouchEnd, { passive: true });
    }

    /**
     * @param {{x: number, y: number}} point
     * @return {'price'|'time'|'separator'|'plot'}
     */
    regionAt(point) {
        if (this.options.timeScale.visible && point.y > this.plot.bottom) {
            return 'time';
        }

        // A separator wins over the price axis: it spans the full width, and
        // the few pixels where they meet are far more likely to be a grab at
        // the divider than a precise attempt to scale one pane's prices.
        if (FULL_BUILD && this.panes.length > 1 && this.options.layout.panes.enableResize
            && separatorAt(this, point.y) >= 0) {
            return 'separator';
        }

        if (this.options.rightPriceScale.visible && point.x > this.plot.right) {
            return 'price';
        }

        if (FULL_BUILD && point.x < this.plot.left) {
            return 'price';
        }

        return 'plot';
    }

    /**
     * The scale whose axis sits under `x`, or the pane's own when the pointer
     * is not in the left gutter.
     *
     * @param {Object} pane
     * @param {number} x
     * @return {Object}
     */
    scaleAtX(pane, x) {
        return FULL_BUILD && x < this.plot.left ? (leftScale(pane) ?? pane) : pane;
    }

    /**
     * @param {number} y
     * @return {Object}
     */
    paneAt(y) {
        return FULL_BUILD && this.panes.length > 1 ? paneAtY(this, y) : this.panes[0];
    }

    localPoint(event) {
        const rect = this.element.getBoundingClientRect();

        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    indexAt(x) {
        if (! this.timeIndex.length) {
            return -1;
        }

        const logical = this.timeScale.xToIndex(x);

        return Math.max(0, Math.min(this.timeIndex.length - 1, Math.round(logical)));
    }

    handlePointerMove(event) {
        if (this.pointer.mode === 'price' || this.pointer.mode === 'time' || this.pointer.mode === 'separator') {
            return;
        }

        const point = this.localPoint(event);

        this.applyCursor(point);
        this.trackSeparatorHover(point);
        this.updateCrosshair(point, event);
    }

    /**
     * Separators light up under the pointer, so it is discoverable that they
     * can be dragged at all.
     *
     * @param {{x: number, y: number}} point
     */
    trackSeparatorHover(point) {
        // Written as a positive condition rather than an early return: a
        // folded `if (false)` block is deleted outright, where code after a
        // guaranteed return may not be.
        if (FULL_BUILD && this.panes.length > 1) {
            const hovered = this.options.layout.panes.enableResize ? separatorAt(this, point.y) : -1;

            if (hovered !== this.hoveredSeparator) {
                this.hoveredSeparator = hovered;
                this.scheduleRender();
            }
        }
    }

    applyCursor(point) {
        const region = this.pointer.mode ?? this.regionAt(point);

        if (region === 'price' && this.axisDragEnabled('price')) {
            this.element.style.cursor = 'ns-resize';

            return;
        }

        if (region === 'time' && this.axisDragEnabled('time')) {
            this.element.style.cursor = 'ew-resize';

            return;
        }

        if (FULL_BUILD && region === 'separator') {
            this.element.style.cursor = 'row-resize';

            return;
        }

        this.element.style.cursor = '';
    }

    /**
     * `handleScale.axisPressedMouseMove` is either a flag for both axes or an
     * object naming them, matching what callers already pass.
     *
     * @param {'price'|'time'} axis
     * @return {boolean}
     */
    axisDragEnabled(axis) {
        const option = this.options.handleScale.axisPressedMouseMove;

        return typeof option === 'object' && option !== null
            ? option[axis] !== false
            : Boolean(option);
    }

    handleDragMove(event) {
        if (! this.pointer.mode) {
            return;
        }

        const point = this.localPoint(event);

        if (this.pointer.mode === 'price') {
            if (this.axisDragEnabled('price')) {
                this.scalePriceAxis(point.y);
                this.pointer.moved = true;
            }

            return;
        }

        if (this.pointer.mode === 'time') {
            if (this.axisDragEnabled('time')) {
                this.scaleTimeAxis(point.x);
                this.pointer.moved = true;
            }

            return;
        }

        if (FULL_BUILD && this.pointer.mode === 'separator') {
            resizePanes(this, this.pointer.separator, point.y, this.pointer.snapshot);
            this.pointer.moved = true;
            this.scheduleRender();

            return;
        }

        if (this.options.handleScroll.pressedMouseMove) {
            this.scrollBy(point.x - this.pointer.lastX);
            this.pointer.lastX = point.x;
            this.pointer.moved = true;
        }
    }

    /**
     * Stretches or compresses the price range about its centre as the axis is
     * dragged. Distances are measured from a pivot below the plot rather than
     * from the plot itself, so the gesture accelerates the further down the
     * axis it is pulled — dragging down compresses, dragging up expands.
     *
     * @param {number} y
     */
    scalePriceAxis(y) {
        const pane = this.pointer.pane;
        const record = this.pointer.scale ?? pane;
        const plot = pane.plot;
        const height = plot.bottom - plot.top;

        if (height <= 1 || ! this.pointer.snapshot) {
            return;
        }

        const pivot = plot.top + height * (1 + record.options.scaleMargins.top);
        const distance = (value) => pivot - Math.max(plot.top, Math.min(plot.bottom, value));
        const from = distance(this.pointer.startY);
        const to = distance(y);

        if (from <= 0 || to <= 0) {
            return;
        }

        const factor = Math.min(50, Math.max(0.02, from / to));
        const { min, max } = this.pointer.snapshot;
        const centre = (min + max) / 2;
        const half = ((max - min) * factor) / 2;

        record.autoScale = false;
        record.manualRange = { min: centre - half, max: centre + half };
        this.scheduleRender();
    }

    /**
     * Widens or narrows bar spacing against the right edge of the plot.
     *
     * @param {number} x
     */
    scaleTimeAxis(x) {
        const width = this.timeScale.width;

        if (width <= 1 || ! this.pointer.snapshot) {
            return;
        }

        const clamp = (value) => Math.max(0, Math.min(width, width - value));
        const current = clamp(x);
        const start = clamp(this.pointer.startX);

        if (current === 0 || start === 0) {
            return;
        }

        this.autoFit = false;
        this.timeScale.setBarSpacing(this.pointer.snapshot.barSpacing * (current / start));
        this.scheduleRender();
    }

    /**
     * Double-clicking an axis hands it back to automatic scaling.
     *
     * @param {MouseEvent} event
     */
    handleDoubleClick(event) {
        const point = this.localPoint(event);
        const region = this.regionAt(point);

        if (region === 'price') {
            const record = this.scaleAtX(this.paneAt(point.y), point.x);

            record.autoScale = true;
            record.manualRange = null;
            this.scheduleRender();

            return;
        }

        if (region === 'time') {
            this.autoFit = true;
            this.scheduleRender();
        }
    }

    updateCrosshair(point, event) {
        if (point.x < this.plot.left || point.x > this.plot.right
            || point.y < this.plot.top || point.y > this.plot.bottom) {
            this.handlePointerLeave();

            return;
        }

        const index = this.indexAt(point.x);

        if (index < 0) {
            return;
        }

        const pane = this.paneAt(point.y);
        const snapped = magnetPrice(pane, index, point.y, this.options.crosshair.mode);
        const y = snapped === null ? point.y : pane.priceScale.priceToY(snapped);

        this.crosshair = { index, y, x: point.x, pane };
        this.drawCrosshair();
        this.emitCrosshair(index, point, event);
    }

    handlePointerLeave() {
        if (! this.crosshair) {
            return;
        }

        this.crosshair = null;
        this.drawCrosshair();

        for (const handler of this.crosshairHandlers) {
            handler({ time: undefined, point: undefined, logical: undefined, seriesData: new Map() });
        }
    }

    emitCrosshair(index, point, event) {
        if (! this.crosshairHandlers.size) {
            return;
        }

        const all = this.allSeries;
        const seriesData = new Map();
        let hoveredSeries;

        for (const series of all) {
            const item = series.byIndex[index];

            if (item) {
                seriesData.set(series.api, item.raw);
                hoveredSeries = hoveredSeries ?? series.api;
            }
        }

        const anyPoint = all.map((series) => series.byIndex[index]).find(Boolean);
        const param = {
            time: anyPoint ? anyPoint.time : undefined,
            logical: index,
            point: { x: point.x, y: point.y },
            seriesData,
            hoveredSeries,
            sourceEvent: event,
        };

        for (const handler of this.crosshairHandlers) {
            handler(param);
        }
    }

    scrollBy(deltaPixels) {
        this.autoFit = false;
        this.timeScale.scrollBy(deltaPixels);
        this.scheduleRender();
    }

    handlePointerDown(event) {
        const point = this.localPoint(event);
        const region = this.regionAt(point);
        const pane = this.paneAt(point.y);

        this.pointer.mode = region;
        this.pointer.pane = pane;
        this.pointer.scale = this.scaleAtX(pane, point.x);
        this.pointer.moved = false;
        this.pointer.lastX = point.x;
        this.pointer.startX = point.x;
        this.pointer.startY = point.y;

        if (region === 'price') {
            this.pointer.snapshot = { min: this.pointer.scale.priceScale.min, max: this.pointer.scale.priceScale.max };
        } else if (region === 'time') {
            this.pointer.snapshot = { barSpacing: this.timeScale.barSpacing };
        } else if (FULL_BUILD && region === 'separator') {
            this.pointer.separator = separatorAt(this, point.y);
            this.pointer.snapshot = resizeSnapshot(this, this.pointer.separator, point.y);
        } else {
            this.pointer.snapshot = null;
        }

        if (region !== 'plot') {
            event.preventDefault();
        }
    }

    handlePointerUp(event) {
        if (this.pointer.mode === 'plot' && ! this.pointer.moved && this.clickHandlers.size) {
            const point = this.localPoint(event);
            const index = this.indexAt(point.x);
            const item = this.allSeries.map((series) => series.byIndex[index]).find(Boolean);

            for (const handler of this.clickHandlers) {
                handler({ time: item ? item.time : undefined, logical: index, point, sourceEvent: event });
            }
        }

        this.pointer.mode = null;
        this.pointer.snapshot = null;
    }

    /**
     * A wheel notch and a trackpad flick differ by an order of magnitude in
     * delta, so the zoom step is taken from the delta rather than applied flat
     * per event — a flat step races away on a trackpad, which fires dozens of
     * small events per gesture. One full notch moves bar spacing by a tenth.
     *
     * @param {WheelEvent} event
     */
    handleWheel(event) {
        const { handleScale, handleScroll } = this.options;

        if (handleScale.mouseWheel) {
            const step = wheelZoomStep(event);

            if (step === 0) {
                return;
            }

            event.preventDefault();
            this.autoFit = false;
            this.timeScale.zoomAt(this.localPoint(event).x, 1 + step / 10);
            this.scheduleRender();

            return;
        }

        if (handleScroll.mouseWheel) {
            event.preventDefault();
            this.scrollBy(-event.deltaX || -event.deltaY);
        }
    }

    handleTouchStart(event) {
        if (FULL_BUILD) {
            this.cancelKinetic?.();
            this.cancelKinetic = null;
        }

        if (event.touches.length === 1) {
            this.pointer.lastX = event.touches[0].clientX;
            this.pointer.pinchDistance = 0;
            this.pointer.touchSpeed = 0;
            this.trackTouch(event.touches[0]);

            return;
        }

        if (event.touches.length === 2) {
            this.pointer.pinchDistance = Math.hypot(
                event.touches[0].clientX - event.touches[1].clientX,
                event.touches[0].clientY - event.touches[1].clientY,
            );
        }
    }

    handleTouchMove(event) {
        const { handleScroll, handleScale } = this.options;

        if (event.touches.length === 2 && handleScale.pinch) {
            const distance = Math.hypot(
                event.touches[0].clientX - event.touches[1].clientX,
                event.touches[0].clientY - event.touches[1].clientY,
            );

            if (this.pointer.pinchDistance > 0) {
                const rect = this.element.getBoundingClientRect();
                const focal = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;

                event.preventDefault();
                this.autoFit = false;
                this.timeScale.zoomAt(focal, distance / this.pointer.pinchDistance);
                this.scheduleRender();
            }

            this.pointer.pinchDistance = distance;

            return;
        }

        if (event.touches.length === 1) {
            const x = event.touches[0].clientX;

            this.trackTouch(event.touches[0]);

            if (handleScroll.horzTouchDrag) {
                const delta = x - this.pointer.lastX;

                event.preventDefault();
                this.scrollBy(delta);
                this.pointer.lastX = x;
                this.pointer.touchSpeed = delta;
            }
        }
    }

    /**
     * Shows the crosshair for a touch, above the finger rather than under it.
     *
     * @param {Touch} touch
     */
    trackTouch(touch) {
        if (FULL_BUILD && this.options.trackingMode) {
            this.updateCrosshair(trackingPoint(touch, this.element.getBoundingClientRect()));
        }
    }

    handleTouchEnd() {
        this.pointer.pinchDistance = 0;

        if (FULL_BUILD) {
            if (this.options.trackingMode?.exitMode === 'onTouchEnd') {
                this.handlePointerLeave();
            }

            if (this.options.kineticScroll?.touch && Math.abs(this.pointer.touchSpeed) > 1) {
                this.cancelKinetic = startKineticScroll(this, this.pointer.touchSpeed);
            }
        }
    }

    /* ----------------------------------------------------------------- api */

    get priceScaleApi() {
        return this.priceScaleApiFor(this.panes[0]);
    }

    /**
     * @param {Object} record a scale record, which for the right-hand scale is
     *     the pane itself
     * @return {Object}
     */
    priceScaleApiFor(record) {
        return {
            applyOptions: (options) => {
                mergeOptions(record.options, options ?? {});

                if (options && options.autoScale) {
                    record.autoScale = true;
                    record.manualRange = null;
                }

                this.scheduleRender();
            },
            options: () => record.options,
            width: () => (record.id === LEFT_SCALE ? this.leftAxisWidth : this.priceAxisWidth),
            setAutoScale: (enabled) => {
                record.autoScale = enabled;

                if (enabled) {
                    record.manualRange = null;
                }

                this.scheduleRender();
            },
        };
    }


    get timeScaleApi() {
        return {
            fitContent: () => {
                this.autoFit = true;
                this.scheduleRender();
            },
            applyOptions: (options) => {
                mergeOptions(this.options.timeScale, options ?? {});
                this.timeScale.options = this.options.timeScale;

                // `rightOffset` and `barSpacing` are live state, not only
                // configuration: the scale copied them once when it was built,
                // so merging them into the options object changes nothing and
                // says nothing about it. Setting either is also an instruction
                // to stop refitting, and any fit still owed is applied first so
                // the explicit value lands on a measured scale rather than on
                // the defaults.
                if (options && options.rightOffset !== undefined) {
                    this.ensureLayout();
                    this.autoFit = false;
                    this.timeScale.rightOffset = options.rightOffset;
                }

                if (options && options.barSpacing !== undefined) {
                    this.ensureLayout();
                    this.autoFit = false;
                    this.timeScale.setBarSpacing(options.barSpacing);
                }

                this.scheduleRender();
            },
            options: () => this.options.timeScale,
            scrollToRealTime: () => {
                this.timeScale.rightOffset = this.timeScale.padBars;
                this.scheduleRender();
            },
            getVisibleRange: () => {
                this.ensureLayout();

                const { from, to } = this.timeScale.visibleIndices();

                if (to < from) {
                    return null;
                }

                return { from: this.timeIndex[from], to: this.timeIndex[to] };
            },
            getVisibleLogicalRange: () => {
                this.ensureLayout();

                return this.timeIndex.length ? this.timeScale.logicalRange() : null;
            },
            timeToCoordinate: (time) => {
                this.ensureLayout();

                const timestamp = toTimestamp(time);

                if (timestamp === null || ! this.timeIndex.length) {
                    return null;
                }

                return this.timeScale.indexToX(nearestIndex(this.timeIndex, timestamp));
            },
            coordinateToTime: (x) => {
                this.ensureLayout();

                const index = this.indexAt(x);

                return index < 0 ? null : this.timeIndex[index];
            },
            width: () => this.timeScale.width,
            subscribeVisibleLogicalRangeChange: (handler) => this.logicalRangeHandlers.add(handler),
            unsubscribeVisibleLogicalRangeChange: (handler) => this.logicalRangeHandlers.delete(handler),
            subscribeVisibleTimeRangeChange: (handler) => this.timeRangeHandlers.add(handler),
            unsubscribeVisibleTimeRangeChange: (handler) => this.timeRangeHandlers.delete(handler),
        };
    }

    resize(width, height) {
        this.applySize(width, height);
        this.scheduleRender();
    }

    applyOptions(options) {
        mergeOptions(this.options, options ?? {});
        this.timeScale.options = this.options.timeScale;
        this.updateAttribution();

        if (options && (options.width || options.height)) {
            this.applySize(options.width ?? this.width, options.height ?? this.height);
        }

        if (options && options.autoSize) {
            this.startAutoSize();
        }

        this.scheduleRender();
    }

    remove() {
        this.removed = true;

        if (FULL_BUILD) {
            this.cancelKinetic?.();
            this.cancelKinetic = null;
        }

        if (this.renderHandle !== null) {
            cancelAnimationFrame(this.renderHandle);
            this.renderHandle = null;
        }

        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        this.element.removeEventListener('mousemove', this.onPointerMove);
        this.element.removeEventListener('mouseleave', this.onPointerLeave);
        this.element.removeEventListener('mousedown', this.onPointerDown);
        this.element.removeEventListener('dblclick', this.onDoubleClick);
        window.removeEventListener('mousemove', this.onDragMove);
        window.removeEventListener('mouseup', this.onPointerUp);
        this.element.removeEventListener('wheel', this.onWheel);
        this.element.removeEventListener('touchstart', this.onTouchStart);
        this.element.removeEventListener('touchmove', this.onTouchMove);
        this.element.removeEventListener('touchend', this.onTouchEnd);

        this.element.remove();
        this.panes = [];
        this.crosshairHandlers.clear();
        this.clickHandlers.clear();
        this.logicalRangeHandlers.clear();
        this.timeRangeHandlers.clear();
    }
}
