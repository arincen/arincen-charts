import { toTimestamp } from './time.js';
import { nearestIndex } from './markers.js';
import { warn } from './errors.js';

/**
 * Drawing back what something else worked out.
 *
 * The other half of `toText`: a chart describes itself, a model answers, and
 * the answer has to land back on the chart. Doing that by hand means knowing
 * which of four unrelated APIs each note belongs to — a point is a marker, a
 * level is a price line, a region and a trend line are primitives somebody has
 * to write — and that a model handing back six notes should not cost six round
 * trips through them.
 *
 * One shape in, whatever it is:
 *
 *     chart.annotate([
 *         { time, price, text },                                  // a point
 *         { price, text },                                        // a level
 *         { from, to, text },                                     // a region
 *         { from: { time, price }, to: { time, price }, text },    // a trend line
 *     ]);
 *
 * Nothing here interprets anything. It is a drawing call whose input happens to
 * be easy for a model to produce.
 */

const DEFAULT_COLOR = '#db2777';
const ZONE_ALPHA = 0.10;
const LABEL_PADDING = 6;
const TREND_WIDTH = 1.5;

/** `#db2777` at some opacity, so a caller supplies one colour and not two. */
function fade(color, alpha) {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);

    if (! hex) {
        return color;
    }

    const [red, green, blue] = [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16));

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** A number, whether it arrived as one or as a string holding one. */
function number(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

/** An end of a trend line: `{ time, price }` however it was spelled. */
function endpoint(value) {
    if (! value || typeof value !== 'object') {
        return null;
    }

    const time = value.time ?? value.at ?? value.date;
    const price = number(value.price ?? value.value ?? value.level);

    return time !== undefined && price !== undefined ? { time, price } : null;
}

/**
 * What a model actually sent, turned into what this function takes.
 *
 * Every repair here is something a working model does on a bad day: JSON inside
 * a markdown fence, one object where an array was asked for, `label` instead of
 * `text`, a price as a string. The alternative is that the drawing silently
 * does nothing and the reader concludes the chart is broken — so it is repaired
 * and said out loud, rather than accepted in silence or refused on a
 * technicality.
 *
 * @return {Object[]}
 */
function readNotes(chart, notes) {
    const repairs = [];

    if (typeof notes === 'string') {
        const fenced = notes.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');

        try {
            notes = JSON.parse(fenced);
            repairs.push('parsed from a string');
        } catch {
            warn(chart, 'annotate was handed a string that is not JSON, so nothing was drawn.');

            return [];
        }
    }

    if (notes && ! Array.isArray(notes) && typeof notes === 'object') {
        // A single note, and a model that returns `{ notes: [...] }` because
        // that is what the tool's own schema called the parameter.
        notes = Array.isArray(notes.notes) ? notes.notes : [notes];
        repairs.push('wrapped in an array');
    }

    if (! Array.isArray(notes)) {
        return [];
    }

    const read = notes.map((note) => {
        if (! note || typeof note !== 'object') {
            return null;
        }

        const text = note.text ?? note.label ?? note.title ?? note.name;
        const price = number(note.price ?? note.value ?? note.level);
        const time = note.time ?? note.at ?? note.date;
        const from = note.from ?? note.start;
        const to = note.to ?? note.end;

        if (text !== note.text && text !== undefined) {
            repairs.push('a label under another name');
        }

        if (typeof (note.price ?? note.value ?? note.level) === 'string') {
            repairs.push('a price written as a string');
        }

        return { ...note, text, price, time, from, to };
    }).filter(Boolean);

    if (repairs.length) {
        // Once, with the tally, rather than a line per note: six notes with the
        // same fault should not be six warnings.
        const counts = repairs.reduce((all, what) => ({ ...all, [what]: (all[what] ?? 0) + 1 }), {});

        warn(chart, `annotate repaired what it was given — ${
            Object.entries(counts).map(([what, times]) => `${what} (${times})`).join(', ')
        }.`);
    }

    return read;
}

/**
 * @param {Object} chart the chart record
 * @param {Object[]|Object|string} notes
 * @param {Object} [options]
 * @param {Object} [options.series] which series to hang points and levels on
 * @return {{clear: () => void, remove: (id: *) => boolean, notes: Object[], ids: *[]}}
 */
export function annotate(chart, notes = [], options = {}) {
    const target = options.series?._internal
        ?? chart.allSeries.find((record) => record.points.length)
        ?? chart.allSeries[0];

    const read = readNotes(chart, notes);

    if (! target) {
        return { clear: () => {}, remove: () => false, notes: read, ids: [] };
    }

    const markers = [];
    const lines = [];
    const zones = [];
    const ids = [];

    for (const note of read) {
        const color = note.color ?? DEFAULT_COLOR;
        const id = note.id ?? `note-${chart.annotationCount = (chart.annotationCount ?? 0) + 1}`;
        const ends = [endpoint(note.from), endpoint(note.to)];

        ids.push(id);

        // A trend line and a region are both `from` and `to`. The difference is
        // whether the ends carry a price: "from this high to that high" is a
        // line, "from March to April" is a stretch of time.
        if (ends[0] && ends[1]) {
            zones.push({ ...note, id, color, kind: 'trend', ends, scale: target.scale });
            continue;
        }

        if (note.from !== undefined && note.to !== undefined) {
            zones.push({ ...note, id, color, kind: 'region' });
            continue;
        }

        if (note.time !== undefined && note.price !== undefined) {
            markers.push({
                id,
                time: note.time,
                position: note.position ?? 'aboveBar',
                shape: note.shape ?? 'circle',
                color,
                text: note.text,
            });

            continue;
        }

        if (note.price !== undefined) {
            lines.push({
                id,
                price: note.price,
                color,
                title: note.text ?? '',
                lineStyle: note.lineStyle,
                axisLabelVisible: true,
            });
        }
    }

    // Added to whatever the series already carries rather than replacing it: a
    // page that draws its own buy and sell markers should not lose them the
    // first time a model says something.
    const markersBefore = [...target.markers];
    const drawn = new Map(lines.map((line) => [line.id, target.api.createPriceLine(line)]));

    target.markers = [...markersBefore, ...markers];
    chart.annotations = [...(chart.annotations ?? []), ...zones];
    chart.scheduleRender();

    /**
     * One note off the chart, by the id it was given or drawn with.
     *
     * "Remove the resistance line, keep the breakout marker" is an ordinary
     * follow-up, and without this the only answer is to clear everything and
     * draw it all again.
     */
    const remove = (id) => {
        const had = target.markers.some((marker) => marker.id === id)
            || drawn.has(id)
            || (chart.annotations ?? []).some((zone) => zone.id === id);

        target.markers = target.markers.filter((marker) => marker.id !== id);
        chart.annotations = (chart.annotations ?? []).filter((zone) => zone.id !== id);

        if (drawn.has(id)) {
            target.api.removePriceLine(drawn.get(id));
            drawn.delete(id);
        }

        chart.scheduleRender();

        return had;
    };

    const handle = {
        notes: read,
        ids,
        remove,

        clear: () => {
            target.markers = target.markers.filter((marker) => ! markers.includes(marker));
            drawn.forEach((line) => target.api.removePriceLine(line));
            drawn.clear();
            chart.annotations = (chart.annotations ?? []).filter((zone) => ! zones.includes(zone));
            chart.scheduleRender();
        },
    };

    // Kept so the chart can take back everything that was drawn on it without
    // the caller having held on to each handle — an agent that drew four times
    // over a conversation has four handles and the reader has one chart.
    chart.annotationHandles = [...(chart.annotationHandles ?? []), handle];

    return handle;
}

/**
 * Everything `annotate` has drawn, off the chart.
 *
 * @param {Object} chart the chart record
 */
export function clearAnnotations(chart) {
    for (const handle of chart.annotationHandles ?? []) {
        handle.clear();
    }

    chart.annotationHandles = [];
}

/**
 * Paints the regions and trend lines, behind the series and above the session
 * shading.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} chart
 */
export function drawAnnotations(ctx, chart) {
    const zones = chart.annotations;

    if (! zones?.length || ! chart.timeIndex.length) {
        return;
    }

    const plot = chart.plot;

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    ctx.clip();

    for (const zone of zones) {
        if (zone.kind === 'trend') {
            drawTrend(ctx, chart, zone, plot);
            continue;
        }

        const from = toTimestamp(zone.from);
        const to = toTimestamp(zone.to);

        if (from === null || to === null) {
            continue;
        }

        const half = chart.timeScale.barSpacing / 2;
        const left = chart.timeScale.indexToX(nearestIndex(chart.timeIndex, Math.min(from, to))) - half;
        const right = chart.timeScale.indexToX(nearestIndex(chart.timeIndex, Math.max(from, to))) + half;

        ctx.fillStyle = zone.fill ?? fade(zone.color, ZONE_ALPHA);
        ctx.fillRect(left, plot.top, Math.max(1, right - left), plot.bottom - plot.top);

        if (zone.text) {
            // Along the top, where a region's label belongs: put it in the
            // middle and it sits on the very readings the region is about.
            ctx.fillStyle = zone.color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(zone.text, labelX(ctx, zone.text, left, plot), plot.top + LABEL_PADDING);
        }
    }

    ctx.restore();
}

/**
 * Where a label can be drawn and still be read.
 *
 * A region near the right edge had its label written off the end of the plot
 * and clipped mid-word — the last thing a model said, cut in half. It moves
 * left until it fits instead, which is what a person labelling it by hand would
 * do without thinking about it.
 */
function labelX(ctx, text, left, plot) {
    const width = ctx.measureText(text).width;
    const latest = plot.right - LABEL_PADDING - width;

    return Math.max(plot.left + LABEL_PADDING, Math.min(left + LABEL_PADDING, latest));
}

/**
 * A line between two points on the chart, which is what "draw the trend" or
 * "the support line" means and what neither a marker nor a price line can be.
 */
function drawTrend(ctx, chart, zone, plot) {
    const scale = zone.scale?.priceScale;

    if (! scale) {
        return;
    }

    const points = zone.ends.map((end) => {
        const ts = toTimestamp(end.time);

        return ts === null ? null : {
            x: chart.timeScale.indexToX(nearestIndex(chart.timeIndex, ts)),
            y: scale.priceToY(end.price),
        };
    });

    if (points.some((point) => ! point)) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = zone.lineWidth ?? TREND_WIDTH;

    if (zone.lineStyle === 2) {
        ctx.setLineDash([4, 4]);
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    ctx.restore();

    if (! zone.text) {
        return;
    }

    // At the earlier end, above the line. The later end is where the last
    // price badge and the axis labels live, and a label put there is read on
    // top of them.
    const first = points[0].x <= points[1].x ? points[0] : points[1];

    ctx.fillStyle = zone.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(zone.text, labelX(ctx, zone.text, first.x + LABEL_PADDING, plot), first.y - LABEL_PADDING);
}
