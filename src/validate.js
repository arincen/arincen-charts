/**
 * Saying what is wrong with the data, instead of drawing it anyway.
 *
 * Every one of these is a mistake the chart could absorb and did: an
 * unparseable time was skipped, an out-of-order series was quietly sorted, a
 * duplicate replaced its twin, a `NaN` drew nothing. The chart came out empty,
 * or short by three bars, or flat — and none of that says *why*, so the first
 * suspicion always falls on the library rather than on the feed.
 *
 * Warnings, not errors. Nothing here stops a chart drawing, because the data
 * that reaches production is not the data anyone tested with, and a chart that
 * refuses to draw is worse than a chart with a gap in it. `throw` belongs to
 * the caller's own mistakes on the public API; this is about what arrived.
 *
 * Milliseconds are deliberately *not* warned about. `toTimestamp` converts them
 * to seconds on the way in, so a millisecond feed draws correctly — warning
 * about something the library handles is how a set of warnings starts being
 * ignored.
 *
 * Always on rather than behind a build flag. The environment tricks — reading
 * `process.env.NODE_ENV` — do not survive into a `<script>` tag, and a bad feed
 * is more likely in production than in development anyway: that is where the
 * odd symbol, the holiday and the exchange's own clock live. Each is said once
 * per chart, and the whole pass is one walk over data already being walked.
 */

/**
 * Checks a whole series' worth of readings.
 *
 * @param {Object} series the series record, not its api
 * @param {unknown} data whatever the caller passed
 * @param {Object[]} points what survived parsing, sorted
 * @param {boolean} arrivedInOrder whether the caller's own order was ascending
 * @return {string[]} one line per problem, empty when there is nothing to say
 */
export function dataProblems(series, data, points, arrivedInOrder = true) {
    const problems = [];

    if (! Array.isArray(data)) {
        return [`setData expected an array and was given ${describe(data)}. Nothing was drawn.`];
    }

    const dropped = data.length - points.length;

    if (dropped > 0) {
        problems.push(
            `${dropped} of ${data.length} readings had a time that could not be read `
            + `and ${dropped === 1 ? 'was' : 'were'} dropped. Times are a unix timestamp in `
            + `seconds, a 'yyyy-mm-dd' string, or { year, month, day }.`,
        );
    }

    let duplicates = 0;

    for (let index = 1; index < points.length; index++) {
        if (points[index].ts === points[index - 1].ts) {
            duplicates++;
        }
    }

    if (! arrivedInOrder) {
        problems.push(
            'The readings arrive out of order. They have been sorted, but a feed that emits out '
            + 'of order usually means two responses were concatenated.',
        );
    }

    if (duplicates) {
        problems.push(
            `${count(duplicates, 'reading')} ${duplicates === 1 ? 'shares' : 'share'} a time with `
            + 'another. Only the last of each survives, so the chart is shorter than the array '
            + 'that produced it.',
        );
    }

    problems.push(...valueProblems(points));

    return problems;
}

/**
 * Checks one reading, as `update` receives it.
 *
 * @param {Object} series
 * @param {Object} point the normalised reading
 * @param {Object|undefined} last the newest reading already held
 * @return {string[]}
 */
export function updateProblems(series, point, last) {
    const problems = [];

    if (last && point.ts < last.ts) {
        problems.push(
            'update() was given a reading older than the last one held. It has been inserted in '
            + 'place, but a live feed going backwards usually means two subscriptions are running.',
        );
    }

    problems.push(...valueProblems([point]));

    return problems;
}

/**
 * The numbers themselves, for readings that carry any.
 *
 * @param {Object[]} points
 * @return {string[]}
 */
function valueProblems(points) {
    const problems = [];

    let broken = 0;
    let inverted = 0;

    for (const point of points) {
        // A reading with nothing in it is whitespace — a deliberate gap, and
        // the one way to say "the market was closed" without inventing a
        // price. Only a value that is present and unusable is a fault.
        if (point.value !== null && point.value !== undefined && ! Number.isFinite(point.value)) {
            broken++;
        }

        if (Number.isFinite(point.high) && Number.isFinite(point.low) && point.high < point.low) {
            inverted++;
        }
    }

    if (broken) {
        problems.push(
            `${count(broken, 'reading')} ${broken === 1 ? 'has' : 'have'} a value that is not a `
            + 'finite number — a NaN, an Infinity, or a string. Those draw as a break in the line, '
            + 'and a string will not compare against a price.',
        );
    }

    if (inverted) {
        problems.push(
            `${count(inverted, 'bar')} ${inverted === 1 ? 'has a high below its low, so its candle draws' : 'have a high below their low, so their candles draw'} upside down.`,
        );
    }

    return problems;
}

/**
 * `1 reading`, `2 readings`.
 *
 * Worth the four lines: a library that counts things and then writes
 * "1 readings" is a library being read by somebody who cares about numbers.
 *
 * @param {number} howMany
 * @param {string} noun
 * @return {string}
 */
function count(howMany, noun) {
    return `${howMany} ${noun}${howMany === 1 ? '' : 's'}`;
}

/** A short, safe description of something that should have been an array. */
function describe(value) {
    return value === null ? 'null' : typeof value;
}
