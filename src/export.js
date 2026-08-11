/**
 * Taking the chart away with you: as a picture, or as its numbers.
 *
 * Both are asked for constantly and neither belongs in a page's own code. A
 * screenshot means knowing there are two canvases and that the visible one is
 * scaled by the device pixel ratio; a CSV means reaching into series internals
 * for readings the chart already holds in the right order.
 *
 * Full build only. A sparkline in a table cell has nothing to export, and this
 * is the kind of feature that is wanted by one chart on a page and never by
 * thirty.
 */

/** The series that carry four prices per reading instead of one. */
const OHLC_SERIES = ['Candlestick', 'Bar'];

/** Excel reads this; a unix timestamp it renders as a large integer. */
function isoTime(ts, intraday) {
    const at = new Date(ts * 1000);

    return intraday ? at.toISOString().replace('T', ' ').slice(0, 19) : at.toISOString().slice(0, 10);
}

/** A field that would otherwise break the row it is in. */
function escape(value) {
    const text = String(value ?? '');

    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The chart as a PNG, exactly as it is on screen.
 *
 * Both canvases, in order, at the ratio they were drawn at — a screenshot
 * taken from the visible canvas alone loses the crosshair and its labels,
 * which on a chart someone is pointing at is the part they meant to capture.
 *
 * @param {Object} chart the chart record
 * @param {Object} [options]
 * @param {string} [options.type] a MIME type; PNG unless you ask otherwise
 * @param {number} [options.quality] for lossy types
 * @param {string} [options.background] painted underneath, for a transparent chart
 * @return {string} a data URL
 */
export function toImage(chart, options = {}) {
    const { type = 'image/png', quality, background } = options;

    const canvas = chart.element.ownerDocument.createElement('canvas');

    // Copied from the canvas that was drawn, not recomputed from the device
    // ratio: the two agree until a window moves between a retina screen and an
    // external monitor, and then a recomputed size crops the picture.
    canvas.width = chart.mainCanvas?.width ?? chart.width;
    canvas.height = chart.mainCanvas?.height ?? chart.height;

    const ctx = canvas.getContext('2d');

    // A chart with a transparent background is the common case, and a
    // transparent PNG dropped into a document or a chat window lands on
    // whatever colour that document uses — often black text on black.
    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (const source of [chart.mainCanvas, chart.overlayCanvas]) {
        if (source) {
            ctx.drawImage(source, 0, 0);
        }
    }

    return canvas.toDataURL(type, quality);
}

/**
 * The readings behind the chart, as a spreadsheet.
 *
 * One row per time, one column per series — the shape somebody opening it in
 * Excel expects, rather than one block per series stacked down the page.
 *
 * @param {Object} chart the chart record
 * @param {Object} [options]
 * @param {boolean} [options.visible] only what is on screen; everything by default
 * @param {string} [options.separator]
 * @return {string}
 */
export function toCSV(chart, options = {}) {
    const { visible = false, separator = ',' } = options;

    const series = chart.allSeries.filter((record) => record.points.length);

    if (! series.length) {
        return '';
    }

    const range = visible ? chart.timeScale.visibleIndices() : null;
    const within = (ts) => {
        if (! range) {
            return true;
        }

        const index = chart.timeIndex.indexOf(ts);

        return index >= Math.floor(range.from) && index <= Math.ceil(range.to);
    };

    const intraday = chart.options.timeScale.timeVisible;
    const columns = [];

    series.forEach((record, at) => {
        // A candlestick is four numbers and a line is one. Writing `close` for
        // both would quietly throw away three quarters of a candlestick chart.
        //
        // Asked of the series type rather than of its numbers: the first
        // version compared open against close, which reads a day of dojis as a
        // line chart and drops its highs and lows.
        const ohlc = OHLC_SERIES.includes(record.definition.type);
        const title = record.options.title || `series ${at + 1}`;

        columns.push(...(ohlc
            ? ['open', 'high', 'low', 'close'].map((field) => ({ record, field, title: `${title} ${field}` }))
            : [{ record, field: 'value', title }]));
    });

    const rows = new Map();

    for (const record of series) {
        for (const point of record.points) {
            if (within(point.ts)) {
                rows.set(point.ts, rows.get(point.ts) ?? new Map());
                rows.get(point.ts).set(record, point);
            }
        }
    }

    const lines = [['time', ...columns.map((column) => column.title)].map(escape).join(separator)];

    for (const ts of [...rows.keys()].sort((a, b) => a - b)) {
        const found = rows.get(ts);

        lines.push([
            isoTime(ts, intraday),

            // A series with no reading at this time leaves its cell empty
            // rather than repeating the last one: a gap in a feed is not the
            // same fact as a price that did not move.
            ...columns.map((column) => {
                const point = found.get(column.record);
                const value = point ? point[column.field] : null;

                return value === null || value === undefined ? '' : value;
            }),
        ].map(escape).join(separator));
    }

    return lines.join('\n');
}
