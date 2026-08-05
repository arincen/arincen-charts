import { Chart } from './chart.js';
import { FULL_BUILD } from './flags.js';
import { paneApis, addPane, removePane, movePane, scaleRecord } from './panes.js';
import { customSeriesDefinition } from './custom-series.js';

export { LineStyle, CrosshairMode, PriceScaleMode } from './options.js';
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
 * @param {Object} [options]
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
