/**
 * The full build's entry point.
 *
 * Same source as the light entry — the difference is the build, not the code.
 * A bundle made from this file is compiled with `__ARINCEN_CHARTS_FULL__` set
 * to true, which switches on the structural features the light build deletes
 * outright (see flags.js).
 *
 * Everything the light entry exports is re-exported here, so `full` is a
 * superset and a caller can move between them by changing only the import.
 */
export {
    createChart,
    createSeriesMarkers,
    LineSeries,
    AreaSeries,
    BaselineSeries,
    CandlestickSeries,
    BarSeries,
    HistogramSeries,
    LineStyle,
    LineType,
    PriceLineSource,
    CrosshairMode,
    PriceScaleMode,
} from './index.js';

// Straight from the options module, not through the light entry: the light
// build cannot act on a last-price animation and so does not export the enum
// naming its modes, and re-exporting it from there would only be re-exporting
// something that is not there.
export { LastPriceAnimationMode } from './options.js';

export { FULL_BUILD } from './flags.js';
export { createTextWatermark, createImageWatermark } from './watermark.js';
export { createUpDownMarkers } from './up-down-markers.js';
