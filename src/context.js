import { summarise, windowOf, within } from './describe.js';

/**
 * The chart as data rather than as a sentence.
 *
 * `toText` is the one to reach for first: a model reasons perfectly well from
 * prose, and prose costs a fraction of the tokens. This is for the other half
 * of the job — arithmetic, a table, a threshold, a chart drawn somewhere else
 * from the same numbers — where parsing English back into floats is work
 * somebody has already done wrong.
 *
 * The two agree by construction: both take their window from `windowOf` and
 * their figures from `summarise`, so the sentence and the object can never
 * describe different highs.
 *
 * Deliberately small. Everything here is something the chart genuinely knows —
 * there are no indicators, no drawings and no selection in this library, and a
 * context object that invents fields for them would be a promise the rest of
 * the code does not keep.
 *
 * Full build only. A page small enough to want the light build is not
 * computing over its own chart.
 *
 * @param {Object} chart the chart record
 * @param {Object} [options] the same window options as `toText`
 * @return {Object}
 */
export function toContext(chart, options = {}) {
    chart.ensureLayout();

    const { from, to, total, whole } = windowOf(chart, options);
    const at = (index) => chart.timeIndex[index] ?? null;

    const series = chart.allSeries.map((record) => {
        const summary = summarise(chart, record, within(chart, record, from, to));
        const shape = {
            title: record.options.title || null,
            type: record.definition.type.toLowerCase(),
            visible: record.options.visible !== false,
            readings: 0,
        };

        if (! summary) {
            return shape;
        }

        return {
            ...shape,
            readings: to - from + 1,
            first: summary.first,
            last: summary.last,
            high: { price: summary.top, time: summary.topAt.time },
            low: { price: summary.bottom, time: summary.bottomAt.time },
            changePercent: summary.move === null ? null : Number(summary.move.toFixed(2)),
        };
    });

    const pointer = chart.crosshairState();

    return {
        range: { from: at(from), to: at(to), bars: total ? to - from + 1 : 0, whole },
        data: { from: at(0), to: at(total - 1), bars: total },
        series,

        // Where the reader is pointing, in the same object rather than as a
        // second call — the question "what is this?" and the question "what am
        // I looking at?" arrive together.
        pointer: pointer ? { time: pointer.time ?? null, price: pointer.price, logical: pointer.logical } : null,

        drawn: {
            markers: chart.allSeries.reduce((sum, record) => sum + record.markers.length, 0),
            priceLines: chart.allSeries.reduce((sum, record) => sum + record.priceLines.length, 0),
            regions: (chart.annotations ?? []).length,
        },
    };
}
