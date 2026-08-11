import { createChart as createChartCore } from './index.js';
import {
    LineSeries,
    AreaSeries,
    CandlestickSeries,
    BarSeries,
    HistogramSeries,
    BaselineSeries,
} from './series.js';

export { createSeriesMarkers } from './index.js';
export { createTooltip } from './tooltip.js';
export { LineStyle, LineType, LastPriceAnimationMode, PriceLineSource, CrosshairMode, PriceScaleMode } from './options.js';
export { FULL_BUILD } from './flags.js';
export { createTextWatermark, createImageWatermark } from './watermark.js';
export { createUpDownMarkers } from './up-down-markers.js';
export {
    LineSeries,
    AreaSeries,
    CandlestickSeries,
    BarSeries,
    HistogramSeries,
    BaselineSeries,
};

/**
 * Script-tag entry for the full build, carrying the same v4-style helpers as
 * the light standalone. See standalone.js for why they live in the script-tag
 * entries rather than the module ones.
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
