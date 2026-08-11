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

import { toTimestamp } from './time.js';
import { nearestIndex } from './markers.js';

const MILLION = 1e6;
const THOUSAND = 1e3;

/**
 * Where a caller's time lands in the data.
 *
 * A period asked about rarely lines up with a reading — markets are shut at
 * the weekend and the question is asked in whole months — so the nearest bar
 * is the honest answer, and an unreadable time falls back to the end of the
 * data it was standing in for.
 */
function boundary(chart, when, fallback) {
    const ts = toTimestamp(when);

    return ts === null ? fallback : nearestIndex(chart.timeIndex, ts);
}

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
/**
 * The numbers behind a sentence, before anybody decides how to say them.
 *
 * Shared with `toContext`, which needs exactly these and would otherwise
 * compute the same extremes a second way — and two implementations of "the
 * high" is how a chart ends up describing itself differently depending on
 * which call you made.
 *
 * @return {Object|null} null when the window holds nothing to summarise
 */
export function summarise(chart, record, points) {
    const readings = points.filter((point) => Number.isFinite(point.value ?? point.close));
    const values = readings.map((point) => point.value ?? point.close);

    if (! values.length) {
        return null;
    }

    const first = values[0];
    const last = values[values.length - 1];
    const highs = readings.map((point) => (Number.isFinite(point.high) ? point.high : point.value));
    const lows = readings.map((point) => (Number.isFinite(point.low) ? point.low : point.value));

    const top = Math.max(...highs);
    const bottom = Math.min(...lows);

    return {
        name: record.options.title || `series ${chart.allSeries.indexOf(record) + 1}`,
        type: record.definition.type.toLowerCase(),
        first,
        last,
        top,
        bottom,
        topAt: readings[highs.indexOf(top)],
        bottomAt: readings[lows.indexOf(bottom)],

        // Percentage against the first reading in view, which is the question a
        // chart is asked: how did this go over the period on screen.
        move: first === 0 ? null : ((last - first) / Math.abs(first)) * 100,
    };
}

function describeSeries(chart, record, points, intraday) {
    const summary = summarise(chart, record, points);

    if (! summary) {
        return `${record.options.title || `series ${chart.allSeries.indexOf(record) + 1}`}`
            + ` (${record.definition.type.toLowerCase()}): no readings.`;
    }

    const { name, type, last, top, bottom, topAt, bottomAt, move } = summary;

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
 * @param {*} [options.from] describe this period instead, without moving the view
 * @param {*} [options.to]
 * @return {string}
 */
/**
 * Which readings a call is about: the view, an asked-for period, or all of it.
 *
 * Shared with `toContext` so that the two cannot disagree about what "the
 * window" means.
 *
 * @return {{from: number, to: number, total: number, whole: boolean}}
 */
export function windowOf(chart, options = {}) {
    const { visible = true } = options;
    const asked = options.from !== undefined && options.to !== undefined;
    const total = chart.timeIndex.length;
    const range = chart.timeScale.visibleIndices();

    // An explicit period wins over the view. "What happened in March?" is a
    // question about March, and answering it should not scroll the chart the
    // reader is looking at — the two are separate, and only the caller knows
    // whether the view is meant to follow.
    const askedFrom = asked ? boundary(chart, options.from, 0) : 0;
    const askedTo = asked ? boundary(chart, options.to, total - 1) : 0;

    // Reversed bounds describe the same period. A model returns them in either
    // order, and `annotate` already takes them either way round.
    const from = asked ? Math.min(askedFrom, askedTo) : (visible ? Math.max(0, Math.floor(range.from)) : 0);
    const to = asked ? Math.max(askedFrom, askedTo) : (visible ? Math.min(total - 1, Math.ceil(range.to)) : total - 1);

    return { from, to, total, whole: from <= 0 && to >= total - 1 };
}

/**
 * The readings of one series that fall inside a window.
 */
export function within(chart, record, from, to) {
    return record.points.filter((point) => {
        const index = chart.timeIndex.indexOf(point.ts);

        return index >= from && index <= to;
    });
}

export function toText(chart, options = {}) {
    const { visible = true } = options;
    const asked = options.from !== undefined && options.to !== undefined;

    chart.ensureLayout();

    const series = chart.allSeries.filter((record) => record.options.visible !== false);
    const withData = series.filter((record) => record.points.length);

    if (! withData.length) {
        return series.length
            ? `An empty chart: ${series.length} series, no readings.`
            : 'An empty chart: no series.';
    }

    const intraday = Boolean(chart.options.timeScale.timeVisible);
    const { from, to, total } = windowOf(chart, options);

    const lines = [
        `A chart of ${withData.length} series over ${total} readings`
        + `, ${date(chart.timeIndex[0], intraday)} to ${date(chart.timeIndex[total - 1], intraday)}.`,
    ];

    if ((asked || visible) && (from > 0 || to < total - 1)) {
        // Said explicitly, because everything below describes the window
        // rather than the data: a model told "high 150" about a chart holding
        // five years will say the wrong thing about the other four.
        lines.push(
            `Showing ${date(chart.timeIndex[from], intraday)} to ${date(chart.timeIndex[to], intraday)}`
            + `, ${to - from + 1} of them.`,
        );
    }

    for (const record of withData) {
        lines.push(describeSeries(chart, record, within(chart, record, from, to), intraday));
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
