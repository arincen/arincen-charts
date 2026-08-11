import { Chart } from './chart.js';
import { FULL_BUILD } from './flags.js';
import { paneApis, addPane, removePane, movePane, scaleRecord } from './panes.js';
import { customSeriesDefinition } from './custom-series.js';
import { toImage, toCSV } from './export.js';
import { toContext } from './context.js';
import { toText } from './describe.js';
import { annotate, clearAnnotations } from './annotate.js';

export { LineStyle, LineType, PriceLineSource, CrosshairMode, PriceScaleMode } from './options.js';
export { sparkline } from './sparkline.js';
export {
    LineSeries,
    AreaSeries,
    CandlestickSeries,
    BarSeries,
    HistogramSeries,
    BaselineSeries,
} from './series.js';

/**
 * Creates a chart inside `container`.
 *
 * The returned API mirrors the subset of the lightweight-charts v5 surface the
 * site actually uses, so a call site can be moved across by changing only its
 * import.
 *
 * @param {HTMLElement} container
 * @param {import('./types.js').ChartOptions} [options]
 * @return {import('./types.js').ChartApi}
 */
export function createChart(container, options) {
    if (! container) {
        throw new Error('createChart requires a container element.');
    }

    const chart = new Chart(container, options);

    if (chart.options.autoSize) {
        chart.startAutoSize();
    }

    const api = {
        addSeries: (definition, seriesOptions, paneIndex) => chart.addSeries(definition, seriesOptions, paneIndex),
        removeSeries: (series) => chart.removeSeries(series),
        applyOptions: (nextOptions) => chart.applyOptions(nextOptions),
        options: () => chart.options,
        resize: (width, height) => chart.resize(width, height),
        remove: () => chart.remove(),
        timeScale: () => chart.timeScaleApi,
        priceScale: (id) => (FULL_BUILD
            ? chart.priceScaleApiFor(scaleRecord(chart.panes[0], id))
            : chart.priceScaleApi),
        subscribeCrosshairMove: (handler) => chart.crosshairHandlers.add(handler),
        unsubscribeCrosshairMove: (handler) => chart.crosshairHandlers.delete(handler),
        subscribeClick: (handler) => chart.clickHandlers.add(handler),
        unsubscribeClick: (handler) => chart.clickHandlers.delete(handler),
        subscribeDblClick: (handler) => chart.dblClickHandlers.add(handler),
        unsubscribeDblClick: (handler) => chart.dblClickHandlers.delete(handler),

        /**
         * Puts the crosshair somewhere without a pointer being there.
         *
         * The reason this exists is two charts side by side: hover one, and
         * the other has to show the same moment. There is no other way to say
         * that, because every other route into the crosshair starts from a
         * mouse event that the second chart never receives.
         *
         * Deliberately does not emit a crosshair event. A pair of charts
         * subscribed to each other would otherwise call each other forever,
         * and the first thing anybody builds with this is a pair of charts
         * subscribed to each other.
         */
        setCrosshairPosition: (price, horizontalPosition, seriesApi) => {
            chart.setCrosshair(price, horizontalPosition, seriesApi);
        },
        clearCrosshairPosition: () => chart.clearCrosshair(),

        /** The plot surface, excluding both axes. Plugin authors ask for this. */
        paneSize: (paneIndex = 0) => {
            chart.ensureLayout();

            const pane = chart.panes[paneIndex] ?? chart.panes[0];

            return {
                width: Math.max(0, pane.plot.right - pane.plot.left),
                height: Math.max(0, pane.plot.bottom - pane.plot.top),
            };
        },

        /**
         * Whether the chart is currently sizing itself from its container.
         *
         * Not simply the option back again: `autoSize` asks for it, and it is
         * refused when the browser has no `ResizeObserver` to do it with. A
         * caller who needs to resize the chart by hand has to know which of
         * those two situations they are in.
         */
        autoSizeActive: () => Boolean(chart.resizeObserver),
        takeScreenshot: () => {
            const canvas = document.createElement('canvas');
            const ratio = window.devicePixelRatio || 1;

            canvas.width = chart.width * ratio;
            canvas.height = chart.height * ratio;

            const ctx = canvas.getContext('2d');

            ctx.drawImage(chart.mainCanvas, 0, 0);
            ctx.drawImage(chart.overlayCanvas, 0, 0);

            return canvas;
        },
        chartElement: () => chart.element,
        _internal: chart,
    };

    // The loop the library is for — the chart says what it shows, something
    // answers, the answer goes back on the chart — is in both builds, because
    // a reader who installs the default one and pastes the first example in
    // the README has to have it work. It is 1.2 KB of the light build's 25.
    api.toText = (textOptions) => toText(chart, textOptions);
    api.toImage = (imageOptions) => toImage(chart, imageOptions);
    api.annotate = (notes, annotateOptions) => annotate(chart, notes, annotateOptions);
    api.pointer = () => chart.crosshairState();

    /**
     * The chart as the reader found it.
     *
     * Anything that can drive a chart can leave it somewhere strange — scrolled
     * off the data, covered in half-right annotations — and the reader is then
     * stuck with it. One call takes it all back, which is cheaper than every
     * caller keeping a record of what it did.
     */
    api.reset = () => {
        clearAnnotations(chart);

        // What `fitContent` does, rather than a call to it: the viewport
        // methods all funnel through the time scale api, and this is the one
        // place that wants the state and not the route to it.
        chart.autoFit = true;
        chart.scheduleRender();
    };

    // Panes are wired here rather than as methods on the chart. A minifier
    // never drops a class method, so a `panes()` method would hold the whole
    // pane module into the light bundle no matter how it was flagged; an
    // arrow function inside a folded `if (false)` block disappears with it.
    if (FULL_BUILD) {
        api.addCustomSeries = (paneView, seriesOptions, paneIndex) => chart.addSeries(
            customSeriesDefinition(paneView),
            seriesOptions,
            paneIndex,
        );
        api.toCSV = (csvOptions) => toCSV(chart, csvOptions);
        api.toContext = (contextOptions) => toContext(chart, contextOptions);
        api.panes = () => paneApis(chart);
        api.addPane = (index) => addPane(chart, index);
        api.removePane = (index) => {
            removePane(chart, index);
            chart.dataChanged();
        };
        api.swapPanes = (from, to) => {
            movePane(chart, from, to);
            chart.scheduleRender();
        };
    }

    // Primitives are handed the chart in `attached`, so the instance needs a
    // way back to its own public surface.
    chart.api = api;

    return api;
}

/**
 * Attaches markers to a series, matching the v5 plugin-style helper.
 *
 * @param {Object} series
 * @param {Array} markers
 * @return {{setMarkers: Function, markers: Function, detach: Function}}
 */
export function createSeriesMarkers(series, markers) {
    series.setMarkers(markers ?? []);

    return {
        setMarkers: (next) => series.setMarkers(next ?? []),
        markers: () => series.markers(),
        detach: () => series.setMarkers([]),
    };
}

/**
 * The public types, re-exported from the entry point.
 *
 * They live in `types.js` as JSDoc, and a `.d.ts` generated from this file
 * carried none of them: `import type { ChartApi } from '@arincen/charts'` —
 * which the React, Vue and API pages all tell people to write — did not
 * compile, and nothing noticed, because the type test imported a dist path
 * and only ever imported values.
 *
 * @typedef {import('./types.js').ChartApi} ChartApi
 * @typedef {import('./types.js').SeriesApi} SeriesApi
 * @typedef {import('./types.js').PaneApi} PaneApi
 * @typedef {import('./types.js').TimeScaleApi} TimeScaleApi
 * @typedef {import('./types.js').PriceScaleApi} PriceScaleApi
 * @typedef {import('./types.js').PriceLineApi} PriceLineApi
 * @typedef {import('./types.js').ChartOptions} ChartOptions
 * @typedef {import('./types.js').SeriesOptionsCommon} SeriesOptionsCommon
 * @typedef {import('./types.js').PriceLineOptions} PriceLineOptions
 * @typedef {import('./types.js').SeriesMarker} SeriesMarker
 * @typedef {import('./types.js').MouseEventParams} MouseEventParams
 * @typedef {import('./types.js').LayoutOptions} LayoutOptions
 * @typedef {import('./types.js').LocalizationOptions} LocalizationOptions
 * @typedef {import('./types.js').GridOptions} GridOptions
 * @typedef {import('./types.js').CrosshairOptions} CrosshairOptions
 * @typedef {import('./types.js').PriceScaleOptions} PriceScaleOptions
 * @typedef {import('./types.js').TimeScaleOptions} TimeScaleOptions
 * @typedef {import('./types.js').HandleScrollOptions} HandleScrollOptions
 * @typedef {import('./types.js').HandleScaleOptions} HandleScaleOptions
 * @typedef {import('./types.js').Point} Point
 * @typedef {import('./types.js').Whitespace} Whitespace
 * @typedef {import('./types.js').Primitive} Primitive
 * @typedef {import('./types.js').PrimitivePaneView} PrimitivePaneView
 * @typedef {import('./types.js').PrimitiveRenderer} PrimitiveRenderer
 * @typedef {import('./types.js').PrimitiveAxisView} PrimitiveAxisView
 * @typedef {import('./types.js').CustomSeriesPaneView} CustomSeriesPaneView
 * @typedef {import('./types.js').RenderTarget} RenderTarget
 * @typedef {import('./types.js').BarsInfo} BarsInfo
 */
