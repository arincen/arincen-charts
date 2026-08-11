import { createChart as createChartCore, createSeriesMarkers } from './index.js';
import {
    LineSeries,
    AreaSeries,
    CandlestickSeries,
    BarSeries,
    HistogramSeries,
    BaselineSeries,
} from './series.js';
import { LineStyle, LineType, PriceLineSource, CrosshairMode, PriceScaleMode } from './options.js';

// The preset belongs in a script-tag build more than anywhere else: a table
// of sparklines is exactly the page that has no bundler.
export { sparkline } from './sparkline.js';

/**
 * Entry point for the `<script>` tag build.
 *
 * Bundling for a script tag rules out tree-shaking anyway, so this is where the
 * v4-style `addLineSeries()` helpers live — keeping them out of the module
 * entry, where a map of every series type would pin all five renderers into any
 * bundle that draws a chart.
 *
 * @param {HTMLElement} container
 * @param {Object} [options]
 * @return {Object}
 */
export function createChart(container, options) {
    const chart = createChartCore(container, options);

    return Object.assign(chart, {
        addLineSeries: (seriesOptions) => chart.addSeries(LineSeries, seriesOptions),
        addAreaSeries: (seriesOptions) => chart.addSeries(AreaSeries, seriesOptions),
        addCandlestickSeries: (seriesOptions) => chart.addSeries(CandlestickSeries, seriesOptions),
        addBarSeries: (seriesOptions) => chart.addSeries(BarSeries, seriesOptions),
        addHistogramSeries: (seriesOptions) => chart.addSeries(HistogramSeries, seriesOptions),
        addBaselineSeries: (seriesOptions) => chart.addSeries(BaselineSeries, seriesOptions),
    });
}

export {
    createSeriesMarkers,
    LineSeries,
    AreaSeries,
    CandlestickSeries,
    BarSeries,
    HistogramSeries,
    BaselineSeries,
    LineStyle,
    LineType,
    PriceLineSource,
    CrosshairMode,
    PriceScaleMode,
};
