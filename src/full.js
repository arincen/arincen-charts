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
    CrosshairMode,
    PriceScaleMode,
} from './index.js';

export { FULL_BUILD } from './flags.js';
export { createTextWatermark } from './watermark.js';
