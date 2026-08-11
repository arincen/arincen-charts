/**
 * Shading the hours the market was shut.
 *
 * An intraday chart runs its bars end to end, so the overnight gap looks
 * exactly like the lunch hour looks exactly like a fast half-hour: the index
 * scale that makes weekends disappear also makes a night disappear. A trader
 * reading a five-day chart cannot see where one day ended.
 *
 * The hours come from the caller, never from us. Shipping a table of exchange
 * hours means owning every holiday, every half-day and every DST change on
 * every exchange for ever, and being quietly wrong the first time one of them
 * moves — while a caller who knows their own market gets it right in four
 * lines. `timeZone` is handed to the platform's own database, which is already
 * on the machine and already correct.
 */

/**
 * `'09:30'` as minutes from midnight.
 *
 * @param {string|number} time
 * @return {number|null}
 */
export function toMinutes(time) {
    if (typeof time === 'number') {
        return Number.isFinite(time) ? time : null;
    }

    const parts = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());

    if (! parts) {
        return null;
    }

    const hours = Number(parts[1]);
    const minutes = Number(parts[2]);

    return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

/**
 * Reads a timestamp in somebody else's timezone.
 *
 * Built once per chart and per zone rather than per bar: `Intl` formatting is
 * the expensive call here, and a visible range is two thousand bars redrawn
 * sixty times a second.
 *
 * @param {string|undefined} timeZone
 * @return {(ts: number) => {day: number, minutes: number}}
 */
function clockIn(timeZone) {
    if (! timeZone) {
        return (ts) => {
            const at = new Date(ts * 1000);

            return { day: at.getUTCDay(), minutes: at.getUTCHours() * 60 + at.getUTCMinutes() };
        };
    }

    const format = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (ts) => {
        const parts = {};

        for (const part of format.formatToParts(new Date(ts * 1000))) {
            parts[part.type] = Number(part.value);
        }

        // Back through UTC only to ask which weekday those fields are. The
        // date has already been moved into the zone; this is arithmetic on it.
        const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

        return { day, minutes: parts.hour * 60 + parts.minute };
    };
}

/**
 * Which of a chart's readings fall outside its trading session.
 *
 * Worked out once per dataset rather than per frame. The answer only changes
 * when the data or the session does, and both are rare next to sixty frames a
 * second.
 *
 * @param {number[]} timeIndex
 * @param {Object} session
 * @return {boolean[]}
 */
export function outsideSession(timeIndex, session) {
    const from = toMinutes(session.from);
    const to = toMinutes(session.to);
    const days = session.days ?? [1, 2, 3, 4, 5];

    if (from === null || to === null) {
        return [];
    }

    const clock = clockIn(session.timeZone);

    return timeIndex.map((ts) => {
        const { day, minutes } = clock(ts);

        if (! days.includes(day)) {
            return true;
        }

        // A session that ends before it starts runs through midnight, which is
        // how Sydney and most crypto-adjacent futures are quoted.
        return from <= to
            ? minutes < from || minutes >= to
            : minutes < from && minutes >= to;
    });
}

/**
 * Which of a chart's readings are closed, worked out once and kept.
 *
 * Keyed on the data and the session together, because those are the only two
 * things that can change the answer. It lives here rather than as a method on
 * the chart so that the light build, which never calls any of this, can drop
 * the whole module — a class method is never dropped, and one referring to
 * this file would have pinned it into every bundle.
 *
 * @param {Object} chart
 * @param {Object} session
 * @return {boolean[]}
 */
function sessionState(chart, session) {
    const key = JSON.stringify([
        session.from,
        session.to,
        session.days,
        session.timeZone,
        chart.timeIndex.length,
        chart.timeIndex[0],
        chart.timeIndex[chart.timeIndex.length - 1],
    ]);

    if (chart.sessions?.key !== key) {
        chart.sessions = { key, closed: outsideSession(chart.timeIndex, session) };
    }

    return chart.sessions.closed;
}

/**
 * Paints the closed hours behind everything else.
 *
 * Consecutive closed bars are filled as one rectangle rather than one per bar:
 * a translucent colour drawn twice over the same pixel is twice as dark, so
 * per-bar fills would band every seam.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} chart
 */
export function drawSessions(ctx, chart) {
    const session = chart.options.sessions;

    if (! session || ! chart.timeIndex.length) {
        return;
    }

    const closed = sessionState(chart, session);

    if (! closed.length) {
        return;
    }

    const { from, to } = chart.timeScale.visibleIndices();
    const plot = chart.plot;

    ctx.fillStyle = session.color ?? 'rgba(127, 127, 127, 0.06)';

    let start = null;

    for (let index = Math.max(0, Math.floor(from)); index <= Math.min(closed.length - 1, Math.ceil(to)); index++) {
        if (closed[index]) {
            start = start ?? index;
            continue;
        }

        if (start !== null) {
            fillSpan(ctx, chart, plot, start, index - 1);
            start = null;
        }
    }

    if (start !== null) {
        fillSpan(ctx, chart, plot, start, Math.min(closed.length - 1, Math.ceil(to)));
    }
}

/** One rectangle from the left edge of a bar to the right edge of another. */
function fillSpan(ctx, chart, plot, first, last) {
    const half = chart.timeScale.barSpacing / 2;
    const left = Math.max(plot.left, chart.timeScale.indexToX(first) - half);
    const right = Math.min(plot.right, chart.timeScale.indexToX(last) + half);

    if (right > left) {
        ctx.fillRect(left, plot.top, right - left, plot.bottom - plot.top);
    }
}
