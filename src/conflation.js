/**
 * Data conflation.
 *
 * Zoomed out far enough, dozens of readings land inside one pixel column, and
 * drawing all of them is drawing the same pixel over and over. Conflation
 * merges the ones that cannot be told apart before anything is drawn — the
 * picture is identical because the difference was never visible.
 *
 * The merging is done once, when the data arrives, and kept as a ladder of
 * levels at doubling coarseness. Merging per frame would walk every point on
 * every frame, which is the cost being avoided; this way a frame walks only
 * the level it needs. The ladder costs about one extra copy of the data in
 * total, because halving repeatedly sums to less than the original.
 *
 * Off by default, matching them: most charts hold hundreds of points, where
 * this is all cost and no benefit.
 */

/** Each level is half as detailed as the one before. */
const LEVEL_FACTOR = 2;

/** Below this there is nothing left worth halving. */
const SMALLEST_LEVEL = 32;

/** A reading narrower than this cannot be told from its neighbour. */
const INDISTINGUISHABLE_PX = 0.5;

/**
 * How many readings share a pixel column, and so how many to merge into one.
 *
 * @param {number} barSpacing CSS px between bar centres
 * @param {number} factor caller's appetite for smoothing; 1 is the threshold
 * @return {number} 1 when nothing should be merged
 */
export function conflationStep(barSpacing, factor = 1) {
    if (! (barSpacing > 0)) {
        return 1;
    }

    // No separate case for bars wide enough to keep: the ceiling of anything
    // at or under one is one, so wide bars fall out of the same arithmetic.
    return Math.ceil(INDISTINGUISHABLE_PX * (factor > 0 ? factor : 1) / barSpacing);
}

/**
 * Combines a run of readings into the one that will be drawn for them.
 *
 * A bar takes the first open, the last close, the highest high and the lowest
 * low — never an average of anything. An averaged candle is a candle that was
 * never traded, and a high that has been averaged away takes the day's extreme
 * off the chart, which is the one thing a reader zoomed out is looking for.
 *
 * A line takes the last value in the run, so the line still passes through a
 * reading that happened rather than through a number nobody quoted.
 *
 * @param {Object[]} points sparse; holes are whitespace and are skipped
 * @param {number} from index of the first
 * @param {number} to index after the last
 * @param {boolean} barLike
 * @return {Object|null} null when the whole run is whitespace
 */
export function mergeRun(points, from, to, barLike) {
    let first = null;
    let last = null;
    let high = -Infinity;
    let low = Infinity;

    for (let index = from; index < to; index++) {
        const point = points[index];

        if (! point || point.value === null || point.value === undefined) {
            continue;
        }

        first = first ?? point;
        last = point;

        if (barLike) {
            high = Math.max(high, point.high ?? point.value);
            low = Math.min(low, point.low ?? point.value);
        }
    }

    if (! last) {
        return null;
    }

    if (! barLike) {
        return last;
    }

    return {
        ...last,
        open: first.open ?? first.value,
        close: last.close ?? last.value,
        high,
        low,
    };
}

/**
 * The ladder of coarser and coarser views of one series.
 *
 * Each level is stored packed — one entry per run, not one per original
 * reading — so a level at stride sixteen is a sixteenth of the size rather
 * than a mostly-empty array of the same length. Halving repeatedly then sums
 * to less than the data itself, which is the whole claim.
 *
 * The first version allocated a full-length array per level, and on half a
 * million readings that was thirteen arrays of half a million slots: six and a
 * half million slots and eighty megabytes to store what fits in one extra
 * copy. It also made the ladder cost grow with the number of levels, which is
 * exactly backwards.
 *
 * Reading one back is `points[index / step]`, and that works unchanged when
 * there is no conflation at all, because a stride of one divides away.
 *
 * @param {Object[]} points the series' `byIndex`
 * @param {boolean} barLike
 * @return {{step: number, points: Object[]}[]} coarsest last
 */
export function buildConflationLevels(points, barLike) {
    const levels = [];

    for (let step = LEVEL_FACTOR; points.length / step >= SMALLEST_LEVEL; step *= LEVEL_FACTOR) {
        const runs = Math.ceil(points.length / step);
        const merged = new Array(runs);

        for (let run = 0; run < runs; run++) {
            const at = run * step;

            merged[run] = mergeRun(points, at, Math.min(at + step, points.length), barLike);
        }

        levels.push({ step, points: merged });
    }

    return levels;
}

/**
 * The coarsest level that still draws everything distinguishable, or null to
 * use the data as it is.
 *
 * Coarsest rather than nearest: every level below the required stride draws
 * points that land on the same pixel, so taking a finer one spends effort on a
 * picture nobody can tell apart.
 *
 * @param {{step: number, points: Object[]}[]} levels
 * @param {number} step from `conflationStep`
 * @return {{step: number, points: Object[]}|null}
 */
export function levelFor(levels, step) {
    let chosen = null;

    for (const level of levels) {
        if (level.step <= step) {
            chosen = level;
        }
    }

    return chosen;
}
