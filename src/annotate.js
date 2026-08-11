import { toTimestamp } from './time.js';
import { nearestIndex } from './markers.js';

/**
 * Drawing back what something else worked out.
 *
 * The other half of `toText`: a chart describes itself, a model answers, and
 * the answer has to land back on the chart. Doing that by hand means knowing
 * which of three unrelated APIs each note belongs to — a point is a marker, a
 * level is a price line, a region is a primitive somebody has to write — and
 * that a model handing back six notes should not cost six round trips through
 * three of them.
 *
 * One shape in, whatever it is:
 *
 *     chart.annotate([
 *         { time, price, text },   // a point on the chart
 *         { price, text },         // a level across it
 *         { from, to, text },      // a region of it
 *     ]);
 *
 * Nothing here interprets anything. It is a drawing call whose input happens to
 * be easy for a model to produce.
 */

const DEFAULT_COLOR = '#db2777';
const ZONE_ALPHA = 0.10;
const LABEL_PADDING = 6;

/** `#db2777` at some opacity, so a caller supplies one colour and not two. */
function fade(color, alpha) {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);

    if (! hex) {
        return color;
    }

    const [red, green, blue] = [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16));

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * @param {Object} chart the chart record
 * @param {Object[]} notes
 * @param {Object} [options]
 * @param {Object} [options.series] which series to hang points and levels on
 * @return {{clear: () => void, notes: Object[]}}
 */
export function annotate(chart, notes = [], options = {}) {
    const target = options.series?._internal
        ?? chart.allSeries.find((record) => record.points.length)
        ?? chart.allSeries[0];

    if (! target) {
        return { clear: () => {}, notes: [] };
    }

    const markers = [];
    const lines = [];
    const zones = [];

    for (const note of notes) {
        const color = note.color ?? DEFAULT_COLOR;

        if (note.from !== undefined && note.to !== undefined) {
            zones.push({ ...note, color });
            continue;
        }

        if (note.time !== undefined && note.price !== undefined) {
            markers.push({
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
    const drawnLines = lines.map((line) => target.api.createPriceLine(line));

    target.markers = [...markersBefore, ...markers];
    chart.annotations = [...(chart.annotations ?? []), ...zones];
    chart.scheduleRender();

    return {
        notes,

        clear: () => {
            target.markers = target.markers.filter((marker) => ! markers.includes(marker));
            drawnLines.forEach((line) => target.api.removePriceLine(line));
            chart.annotations = (chart.annotations ?? []).filter((zone) => ! zones.includes(zone));
            chart.scheduleRender();
        },
    };
}

/**
 * Paints the regions, behind the series and above the session shading.
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
            ctx.fillText(zone.text, left + LABEL_PADDING, plot.top + LABEL_PADDING);
        }
    }

    ctx.restore();
}
