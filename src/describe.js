/**
 * The chart, in words.
 *
 * A chart is a picture of numbers, and everything that is not a pair of eyes —
 * a language model, a screen reader, an alerting job, a test — has to get at
 * those numbers some other way. Today that means reaching into series
 * internals and writing the same summary again, badly, in every project.
 *
 * So the chart says what it is showing. The output is deterministic and short
 * enough to paste into a prompt: what is drawn, over what period, where it
 * ended, and how far it moved. Not an interpretation — no "bullish", no
 * "resistance". A description a model can reason from, not a conclusion it has
 * to trust.
 *
 * Full build only, alongside the rest of the export work.
 */

const MILLION = 1e6;
const THOUSAND = 1e3;

/** A date the way the rest of the library writes one. */
function date(ts, intraday) {
    const at = new Date(ts * 1000);

    return intraday ? at.toISOString().replace('T', ' ').slice(0, 16) : at.toISOString().slice(0, 10);
}

/**
 * A price, at a sensible number of digits.
 *
 * The caller's own formatter first: a chart whose prices carry a currency or a
 * volume abbreviation should describe itself the same way it labels itself.
 *
 * @param {Object} chart
 * @param {number} value
 * @return {string}
 */
function price(chart, value) {
    const formatter = chart.options.localization.priceFormatter;

    if (typeof formatter === 'function') {
        return String(formatter(value));
    }

    const size = Math.abs(value);

    if (size >= MILLION) {
        return `${(value / MILLION).toFixed(2)}M`;
    }

    if (size >= THOUSAND) {
        return `${(value / THOUSAND).toFixed(2)}K`;
    }

    return value.toFixed(size < 1 ? 4 : 2);
}

/**
 * One line about one series.
 *
 * @param {Object} chart
 * @param {Object} record
 * @param {Object[]} points the readings being described
 * @param {boolean} intraday
 * @return {string}
 */
function describeSeries(chart, record, points, intraday) {
    const name = record.options.title || `series ${chart.allSeries.indexOf(record) + 1}`;
    const type = record.definition.type.toLowerCase();

    const readings = points.filter((point) => Number.isFinite(point.value ?? point.close));
    const values = readings.map((point) => point.value ?? point.close);

    if (! values.length) {
        return `${name} (${type}): no readings.`;
    }

    const first = values[0];
    const last = values[values.length - 1];
    const highs = readings.map((point) => (Number.isFinite(point.high) ? point.high : point.value));
    const lows = readings.map((point) => (Number.isFinite(point.low) ? point.low : point.value));

    const top = Math.max(...highs);
    const bottom = Math.min(...lows);
    const topAt = readings[highs.indexOf(top)];
    const bottomAt = readings[lows.indexOf(bottom)];

    // Percentage against the first reading in view, which is the question a
    // chart is asked: how did this go over the period on screen.
    const move = first === 0 ? null : ((last - first) / Math.abs(first)) * 100;

    return `${name} (${type}): last ${price(chart, last)}`
        + `, high ${price(chart, top)} on ${date(topAt.ts, intraday)}`
        + `, low ${price(chart, bottom)} on ${date(bottomAt.ts, intraday)}`
        + (move === null ? '' : `, ${move >= 0 ? 'up' : 'down'} ${Math.abs(move).toFixed(2)}% over the period`)
        + '.';
}

/**
 * @param {Object} chart the chart record
 * @param {Object} [options]
 * @param {boolean} [options.visible] describe only what is on screen; the default
 * @return {string}
 */
export function toText(chart, options = {}) {
    const { visible = true } = options;

    chart.ensureLayout();

    const series = chart.allSeries.filter((record) => record.options.visible !== false);
    const withData = series.filter((record) => record.points.length);

    if (! withData.length) {
        return series.length
            ? `An empty chart: ${series.length} series, no readings.`
            : 'An empty chart: no series.';
    }

    const intraday = Boolean(chart.options.timeScale.timeVisible);
    const total = chart.timeIndex.length;
    const range = chart.timeScale.visibleIndices();

    const from = visible ? Math.max(0, Math.floor(range.from)) : 0;
    const to = visible ? Math.min(total - 1, Math.ceil(range.to)) : total - 1;

    const lines = [
        `A chart of ${withData.length} series over ${total} readings`
        + `, ${date(chart.timeIndex[0], intraday)} to ${date(chart.timeIndex[total - 1], intraday)}.`,
    ];

    if (visible && (from > 0 || to < total - 1)) {
        // Said explicitly, because everything below describes the window
        // rather than the data: a model told "high 150" about a chart holding
        // five years will say the wrong thing about the other four.
        lines.push(
            `Showing ${date(chart.timeIndex[from], intraday)} to ${date(chart.timeIndex[to], intraday)}`
            + `, ${to - from + 1} of them.`,
        );
    }

    for (const record of withData) {
        const points = record.points.filter((point) => {
            const index = chart.timeIndex.indexOf(point.ts);

            return index >= from && index <= to;
        });

        lines.push(describeSeries(chart, record, points, intraday));
    }

    const markers = withData.reduce((sum, record) => sum + record.markers.length, 0);
    const priceLines = withData.reduce((sum, record) => sum + record.priceLines.length, 0);

    if (markers || priceLines) {
        lines.push([
            markers ? `${markers} marker${markers === 1 ? '' : 's'}` : null,
            priceLines ? `${priceLines} price line${priceLines === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(', ') + '.');
    }

    return lines.join('\n');
}
