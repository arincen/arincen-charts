import {
    chartDefaults,
    leftScaleDefaults,
    mergeOptions,
    applyLineStyle,
    CrosshairMode,
    LastPriceAnimationMode,
    LineStyle,
    PriceLineSource,
    PriceScaleMode,
    isRightToLeft,
} from './options.js';
import { FULL_BUILD } from './flags.js';
import { report, warn } from './errors.js';
import { drawSessions } from './sessions.js';
import { drawAnnotations } from './annotate.js';
import { dataProblems, updateProblems } from './validate.js';
import { attachKeyboard } from './keyboard.js';
import { prefersReducedMotion } from './motion.js';
import { palette, watchPreferred } from './theme.js';
import { TimeScale } from './scales.js';
import {
    createPane,
    MAIN_PANE_STRETCH,
    paneDefaults,
    layoutPanes,
    paneAtY,
    separatorAt,
    drawPaneSeparators,
    resizePanes,
    resizeSnapshot,
    ensurePane,
    scaleRecord,
    paneScales,
    leftScale,
    LEFT_SCALE,
} from './panes.js';
import { toTimestamp, tickWeight, formatTick, formatCrosshairTime, TickWeight } from './time.js';
import { normalisePoint } from './series.js';
import { buildConflationLevels, conflationStep, levelFor } from './conflation.js';
import { drawMarkers, nearestIndex } from './markers.js';
import { createRenderTarget, drawPrimitives } from './render-target.js';
import { contrastTextColor } from './colors.js';
import { createLongPress, trackingPoint, startKineticScroll } from './touch.js';
import { placeAttributionMark, createAttributionMark } from './mark.js';

const LABEL_PADDING_X = 6;

/** Length of the mark joining an axis label to its line. */
const TICK_MARK = 4;

/** How far the point on a price badge reaches toward the level it names. */
const BADGE_NOTCH = 5;

/** How faint the "no data" line is against the chart's own text colour. */
const PLACEHOLDER_ALPHA = 0.55;

/** How near the pointer must come to a series to bring it forward, in CSS px. */
const FOCUS_REACH = 14;

/** What the others fade to while one series has the pointer. */
const DIMMED_ALPHA = 0.25;

/** How much wider than the crosshair its halo is drawn, and how faint. */
const CROSSHAIR_HALO_WIDTH = 4;
const CROSSHAIR_HALO_ALPHA = 0.12;

/**
 * Corner radius on the three corners away from the point.
 *
 * Small. The application's own controls are 8px, but a badge is eighteen tall
 * and an 8px radius on that reads as a pill — which loses the one thing the
 * shape is for, that it is a tag aimed at a line. Three is enough to stop the
 * corners looking cut and not enough to soften the point.
 */
const BADGE_RADIUS = 3;
const AXIS_PADDING = 12;
const TICK_GAP = 46;
const MIN_CLASS_SPACING = 20;
const MARKER_HEADROOM = 28;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

/** One detent of a wheel, in each of the three units a browser may report. */
const PIXELS_PER_NOTCH = 100;
const LINES_PER_NOTCH = 3;
const PAGES_PER_NOTCH = 1;

/**
 * How far the wheel turned, in notches, as a -1..1 zoom step.
 *
 * A wheel event reports its delta in one of three units and the browser
 * decides which, so the question to answer is not "how many pixels" but "how
 * much of one detent is this", after which every device is comparable:
 *
 *   pixels — a detent is ~100px, which is what Chrome and Safari emit
 *   lines  — a detent is 3 lines, which is what Firefox emits
 *   pages  — a detent is one page
 *
 * Clamped to a single notch so a trackpad, which fires dozens of small events
 * per gesture, cannot outrun a mouse that fires one large one.
 *
 * @param {WheelEvent} event
 * @return {number}
 */
export function wheelZoomStep(event) {
    const perNotch = event.deltaMode === WHEEL_DELTA_LINE
        ? LINES_PER_NOTCH
        : (event.deltaMode === WHEEL_DELTA_PAGE ? PAGES_PER_NOTCH : PIXELS_PER_NOTCH);
    const notches = -event.deltaY / perNotch;

    return Math.sign(notches) * Math.min(1, Math.abs(notches));
}

/**
 * Applies a series' own `priceFormat` to a number.
 *
 * Rounding to `minMove` before fixing the decimals is what makes a tick size
 * mean anything: an instrument quoted in quarters should read 63.25 and 63.50,
 * never 63.31. Falling back to the scale's own precision keeps every series
 * that never asked for a format looking exactly as it did.
 *
 * Positional, so `series` is passed as `undefined` rather than left out — it
 * was declared optional with a required parameter after it, which no
 * declaration file can express and every caller had never relied on.
 *
 * @param {number} price
 * @param {Object|undefined} series
 * @param {number} fallbackPrecision
 * @return {string}
 */
export function formatWithPriceFormat(price, series, fallbackPrecision) {
    const format = series?.options?.priceFormat;

    if (! format) {
        return price.toFixed(fallbackPrecision);
    }

    const rounded = format.minMove > 0
        ? Math.round(price / format.minMove) * format.minMove
        : price;

    if (format.type === 'percent') {
        return `${rounded.toFixed(format.precision ?? 2)}%`;
    }

    if (format.type === 'volume') {
        return formatVolume(rounded);
    }

    return rounded.toFixed(format.precision ?? fallbackPrecision);
}

const VOLUME_UNITS = [
    { at: 1e9, suffix: 'B' },
    { at: 1e6, suffix: 'M' },
    { at: 1e3, suffix: 'K' },
];

function formatVolume(value) {
    const unit = VOLUME_UNITS.find((candidate) => Math.abs(value) >= candidate.at);

    return unit ? `${(value / unit.at).toFixed(2)}${unit.suffix}` : String(Math.round(value));
}

/**
 * The prices a single series occupies over the visible slice, or null when it
 * has nothing on screen.
 *
 * @param {Object} series
 * @param {number} from
 * @param {number} to
 * @return {{minValue: number, maxValue: number}|null}
 */
export function seriesPriceRange(series, from, to) {
    const barLike = series.definition.isBarLike;
    let min = Infinity;
    let max = -Infinity;

    // A histogram is read against its base, so the base belongs on the axis
    // whether or not a bar reaches it — otherwise volume bars are cut off at
    // the bottom of their own pane instead of standing on a zero line.
    if (series.options.base !== undefined) {
        min = series.options.base;
        max = series.options.base;
    }

    for (let index = from; index <= to; index++) {
        const point = series.byIndex[index];

        if (! point) {
            continue;
        }

        const low = barLike ? point.low : point.value;
        const high = barLike ? point.high : point.value;

        if (low !== null && low !== undefined && low < min) {
            min = low;
        }

        if (high !== null && high !== undefined && high > max) {
            max = high;
        }
    }

    return min === Infinity ? null : { minValue: min, maxValue: max };
}

/**
 * Widens a range to take in whatever the series' primitives say they need.
 *
 * A primitive that draws above the data — a target, a projection, a band —
 * is otherwise clipped at the top of the pane, and the reader is looking at a
 * chart that is quietly not showing them the thing the plugin exists to show.
 *
 * Only ever widens. A primitive returning a narrower range would be asking the
 * chart to hide the price, which is not a primitive's decision to make.
 *
 * @param {Object[]} primitives
 * @param {{minValue: number, maxValue: number}|null} range
 * @param {number} from logical index
 * @param {number} to
 * @return {{minValue: number, maxValue: number}|null}
 */
export function widenForPrimitives(primitives, range, from, to, chart) {
    let widened = range;

    for (const primitive of primitives) {
        let info;

        try {
            info = primitive.autoscaleInfo?.(from, to);
        } catch (error) {
            report(chart, error, 'primitive.autoscaleInfo');
            continue;
        }

        const priceRange = info?.priceRange;

        if (! priceRange || ! Number.isFinite(priceRange.minValue) || ! Number.isFinite(priceRange.maxValue)) {
            continue;
        }

        widened = widened === null
            ? { minValue: priceRange.minValue, maxValue: priceRange.maxValue }
            : {
                minValue: Math.min(widened.minValue, priceRange.minValue),
                maxValue: Math.max(widened.maxValue, priceRange.maxValue),
            };
    }

    return widened;
}

/**
 * Hands a series' own range to its `autoscaleInfoProvider` and takes back
 * whatever that decides.
 *
 * The provider receives a function rather than the range itself, matching
 * lightweight-charts: a provider that only wants to widen the default should
 * not have to recompute it, and one that ignores the default should not pay
 * for it. Margins are fractions of the plot height, applied to the range.
 *
 * @param {Object} series
 * @param {{minValue: number, maxValue: number}} range
 * @return {{minValue: number, maxValue: number}}
 */
export function applyAutoscaleProvider(series, range) {
    let info;

    try {
        info = series.options.autoscaleInfoProvider(() => ({ priceRange: { ...range } }));
    } catch (error) {
        report(series.chart, error, 'series.autoscaleInfoProvider');

        return range;
    }

    const priceRange = info?.priceRange;

    if (! priceRange || ! Number.isFinite(priceRange.minValue) || ! Number.isFinite(priceRange.maxValue)) {
        return range;
    }

    const span = priceRange.maxValue - priceRange.minValue;
    const above = info.margins?.above ?? 0;
    const below = info.margins?.below ?? 0;

    return {
        minValue: priceRange.minValue - span * below,
        maxValue: priceRange.maxValue + span * above,
    };
}

// A line-shaped point carries `value` and a bar-shaped one carries `close`;
// both are "the price this bar ended at", which is what the plain magnet snaps
// to. Listing only `value` left every candlestick chart unmagnetised in the
// default mode, silently, because nothing snapped rather than snapping wrongly.
const MAGNET_CLOSE = ['value', 'close'];
const MAGNET_OHLC = ['open', 'high', 'low', 'close'];

/**
 * The price a magnetised crosshair should sit at, or null to leave the pointer
 * where it is.
 *
 * Candidates are compared in pixels rather than in price, and every visible
 * series on the pane offers them — snapping to the first series instead means
 * that on a chart with a price line and a moving average, the crosshair clings
 * to the price however close the pointer gets to the average.
 *
 * @param {Object} pane
 * @param {number} index
 * @param {number} y pointer position
 * @param {number} mode
 * @return {number|null}
 */
/**
 * The series the pointer is nearest to, or null when it is near none of them.
 *
 * Used to fade everything else. Nearest by pixels rather than by draw order:
 * a chart with four lines on it is asking the reader to follow one, and the
 * one they are following is the one under the cursor — not the first that
 * happens to hold a reading at this index, which is what the crosshair event
 * already reports and is right for a different question.
 *
 * The reach is deliberately short. Fading three series because the pointer
 * drifted vaguely toward a fourth is worse than not fading at all: the reader
 * loses the comparison they came for and has no idea what they did to cause it.
 *
 * @param {Object} pane
 * @param {number} index
 * @param {number} y CSS px
 * @param {number} reach how close the pointer has to be, in CSS px
 * @return {Object|null}
 */
export function seriesUnderPointer(pane, index, y, reach) {
    let nearest = null;
    let best = reach;

    for (const series of pane.series) {
        if (! series.options.visible) {
            continue;
        }

        const point = series.byIndex[index];

        if (! point) {
            continue;
        }

        for (const key of MAGNET_OHLC) {
            const value = point[key];

            if (value === null || value === undefined) {
                continue;
            }

            const distance = Math.abs(series.scale.priceScale.priceToY(value) - y);

            if (distance <= best) {
                best = distance;
                nearest = series;
            }
        }
    }

    return nearest;
}

export function magnetPrice(pane, index, y, mode, skipHidden = true) {
    if (mode !== CrosshairMode.Magnet && mode !== CrosshairMode.MagnetOHLC) {
        return null;
    }

    const keys = mode === CrosshairMode.MagnetOHLC ? MAGNET_OHLC : MAGNET_CLOSE;
    let nearest = null;
    let shortest = Infinity;

    for (const series of pane.series) {
        if (skipHidden && ! series.options.visible) {
            continue;
        }

        const point = series.byIndex[index];

        if (! point) {
            continue;
        }

        for (const key of keys) {
            const price = point[key];

            if (price === null || price === undefined) {
                continue;
            }

            const distance = Math.abs(series.scale.priceScale.priceToY(price) - y);

            if (distance < shortest) {
                shortest = distance;
                nearest = { price, scale: series.scale.priceScale };
            }
        }
    }

    return nearest;
}

/**
 * The pixel the crosshair should snap to, or null.
 *
 * The price on its own is not enough. It was converted back through the pane's
 * main scale, which is the same scale it came from only while every series is
 * on the right-hand axis — put one on the left and the crosshair snapped to a
 * price on one scale and drew it at the height that price occupies on another,
 * so the badge read a number from nowhere near the chart.
 *
 * @return {number|null} y in CSS px
 */
export function magnetY(pane, index, y, mode, skipHidden = true) {
    const snapped = magnetPrice(pane, index, y, mode, skipHidden);

    return snapped === null ? null : snapped.scale.priceToY(snapped.price);
}

/**
 * Brings every view of every primitive up to date before any of them paints.
 *
 * @param {Object[]} primitives
 */
function refreshPrimitives(primitives, chart) {
    for (const primitive of primitives) {
        try {
            primitive.updateAllViews?.();
        } catch (error) {
            // A primitive that cannot update still gets asked to draw; it is
            // its own business whether it has anything to show.
            report(chart, error, 'primitive.updateAllViews');
        }
    }
}

/**
 * Adds each primitive's price-axis labels to the badges the axis will paint.
 *
 * A view is asked for its coordinate rather than for a price, because the
 * thing it is labelling need not be a price at all — a plugin marking a
 * measured distance knows where its label goes in pixels and would have to
 * invert the scale to express that as a number the axis then converts back.
 *
 * @param {Object[]} primitives
 * @param {Object} record price-scale record the axis belongs to
 * @param {Object} pane
 * @param {Object[]} badges collected so far, appended to in place
 */
function collectPrimitiveBadges(primitives, record, pane, badges, chart) {
    for (const primitive of primitives) {
        let views;

        try {
            views = primitive.priceAxisViews?.() ?? [];
        } catch (error) {
            report(chart, error, 'primitive.priceAxisViews');
            continue;
        }

        for (const view of views) {
            try {
                if (view.visible?.() === false) {
                    continue;
                }

                const y = view.fixedCoordinate?.() ?? view.coordinate();

                // Off-scale labels are dropped rather than clamped to the
                // edge, which would claim the axis reaches somewhere it does
                // not — the same rule the caller's price lines follow.
                if (! Number.isFinite(y) || y < pane.plot.top || y > pane.plot.bottom) {
                    continue;
                }

                badges.push({
                    y,
                    text: view.text(),
                    background: view.backColor(),
                    textColor: view.textColor(),
                    title: '',

                    // Documented on their axis view and accepted by ours since
                    // the day primitives landed, while doing nothing at all. A
                    // plugin author setting a field and seeing no change has
                    // been told a lie about the contract.
                    tick: view.tickVisible?.() !== false,
                });
            } catch (error) {
                // One broken view costs its own label, not the axis.
                report(chart, error, 'primitive.priceAxisView');
            }
        }
    }
}

/**
 * The same for the time axis, where the coordinate is a distance from the left.
 *
 * @param {Object[]} primitives
 * @param {Object[]} labels collected so far, appended to in place
 */
function collectTimeAxisLabels(primitives, labels, chart) {
    for (const primitive of primitives) {
        let views;

        try {
            views = primitive.timeAxisViews?.() ?? [];
        } catch (error) {
            report(chart, error, 'primitive.timeAxisViews');
            continue;
        }

        for (const view of views) {
            try {
                if (view.visible?.() === false) {
                    continue;
                }

                const x = view.fixedCoordinate?.() ?? view.coordinate();

                if (Number.isFinite(x)) {
                    labels.push({ x, text: view.text(), background: view.backColor(), textColor: view.textColor() });
                }
            } catch (error) {
                // One broken view costs its own label, not the axis.
                report(chart, error, 'primitive.timeAxisView');
            }
        }
    }
}

/**
 * The two strips outside the plot that a primitive may draw into.
 *
 * A pure function of the layout rather than a block inside the drawing code,
 * because geometry that only exists inside a method needs a real browser to
 * check — and a strip that came out empty, or that reached back over the plot,
 * would paint nothing or paint on top of the chart while every test still
 * passed.
 *
 * Each is expressed as its own rectangle so a renderer's coordinates start at
 * the strip's corner rather than the canvas's.
 *
 * @param {{left: number, top: number, right: number, bottom: number}} plot
 * @param {number} width whole canvas, CSS px
 * @param {number} height
 * @return {{views: string, left: number, top: number, width: number, height: number}[]}
 */
export function axisStrips(plot, width, height) {
    return [
        {
            views: 'priceAxisPaneViews',
            left: plot.right,
            top: plot.top,
            width: Math.max(0, width - plot.right),
            height: Math.max(0, plot.bottom - plot.top),
        },
        {
            views: 'timeAxisPaneViews',
            left: plot.left,
            top: plot.bottom,
            width: Math.max(0, plot.right - plot.left),
            height: Math.max(0, height - plot.bottom),
        },
    ];
}

/** One breath of the last-price ring. */
const PULSE_PERIOD_MS = 2600;
const PULSE_DOT_RADIUS = 4;
const PULSE_REACH = 11;

/**
 * How far through a single pulse we are, or null when there is none running.
 *
 * Separated from the drawing so the timing can be tested without a canvas —
 * an animation that quietly never ends is a chart that quietly never stops
 * asking for frames, which is a battery complaint rather than a visible bug.
 *
 * @param {number} startedAt
 * @param {number} now
 * @return {number|null} 0..1
 */
export function pulsePhase(startedAt, now) {
    if (! startedAt) {
        return null;
    }

    const elapsed = now - startedAt;

    return elapsed < 0 || elapsed >= PULSE_PERIOD_MS ? null : elapsed / PULSE_PERIOD_MS;
}

/** The same, for a series that should always look live. */
export function continuousPhase(now) {
    return ((now % PULSE_PERIOD_MS) + PULSE_PERIOD_MS) % PULSE_PERIOD_MS / PULSE_PERIOD_MS;
}

/**
 * A solid dot with a ring expanding and fading away from it.
 *
 * The ring carries the movement and the dot stays put, so the eye is drawn to
 * the point rather than to the animation — the opposite arrangement reads as a
 * loading spinner sitting on the price.
 */
function drawPulse(ctx, x, y, progress, colour) {
    ctx.save();
    ctx.fillStyle = colour;
    ctx.globalAlpha = (1 - progress) * 0.45;
    ctx.beginPath();
    ctx.arc(x, y, PULSE_DOT_RADIUS + PULSE_REACH * progress, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, PULSE_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/**
 * Nudges axis badges apart so none is buried under another.
 *
 * Two labels at nearly the same price — a last value and an alert a few ticks
 * away — paint over each other, and the one underneath becomes a fringe of
 * pixels around the one on top. Neither is then readable, which is worse than
 * either being a pixel out of place.
 *
 * Solved as a settle rather than a sort: a pass down the list pushes each
 * badge clear of the one above it, then a pass back up rescues anything that
 * was pushed off the bottom. Two passes are enough because the first leaves
 * the list ordered and evenly spaced, so the second only ever has to slide a
 * run of them upward together.
 *
 * Positions are changed; nothing is dropped. A caller who put a label at a
 * price is owed the label.
 *
 * @param {{y: number}[]} badges
 * @param {number} height of one badge
 * @param {number} top of the pane
 * @param {number} bottom
 * @return {{y: number}[]} the same badges, ordered and spread
 */
export function spreadBadges(badges, height, top, bottom) {
    const ordered = [...badges].sort((a, b) => a.y - b.y);

    let lowest = top - height;

    for (const badge of ordered) {
        badge.y = Math.max(badge.y, lowest + height);
        lowest = badge.y;
    }

    let highest = bottom + height;

    for (let index = ordered.length - 1; index >= 0; index--) {
        ordered[index].y = Math.min(ordered[index].y, highest - height);
        highest = ordered[index].y;
    }

    return ordered;
}

/**
 * Moves one entry to a new position in a list, in place.
 *
 * Clamped rather than refused: a caller asking to put a series on top should
 * not have to count how many there are first, and an index past the end plainly
 * means the end.
 *
 * @param {Array} list
 * @param {*} item
 * @param {number} order
 * @return {Array} the same list
 */
export function moveInOrder(list, item, order) {
    const from = list.indexOf(item);

    if (from < 0) {
        return list;
    }

    list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, Math.round(order))), 0, item);

    return list;
}

/**
 * The reading a price line and its badge should follow.
 *
 * `LastBar` is the newest bar in the data, on screen or not. `LastVisible` is
 * the newest one actually in view, so scrolling back through history takes the
 * line with you instead of leaving it pinned to a price that scrolled off the
 * right edge — where it still reads as the current price, and is not.
 *
 * @param {Object} series
 * @param {number} visibleTo last index in view
 * @return {Object|null}
 */
export function sourcePoint(series, visibleTo) {
    if (series.options.priceLineSource !== PriceLineSource.LastVisible) {
        return series.lastPoint();
    }

    for (let index = Math.min(visibleTo, series.byIndex.length - 1); index >= 0; index--) {
        const point = series.byIndex[index];

        if (point && point.value !== null && point.value !== undefined) {
            return point;
        }
    }

    return null;
}

/** Painting order, so a hit on a higher layer beats one underneath it. */
const Z_ORDER_RANK = { bottom: 0, normal: 1, top: 2 };

/** A hit on an explicit point, which outranks a line or a region. */
const POINT_HIT = 2;

/**
 * Whether `candidate` should win over `winner`.
 *
 * The layer decides first — something drawn on top is what the pointer is
 * over. Within a layer a point beats anything else however far away it is,
 * because a handle is a thing you aim at and a region is a thing you are
 * merely inside; a drawing's endpoints must stay grabbable when they sit on
 * top of its own fill. Only then does distance decide, and ties keep the order
 * the primitives were attached in.
 *
 * @param {Object} candidate
 * @param {Object} winner
 * @return {boolean}
 */
/**
 * A crosshair line, over a halo of the background it is crossing.
 *
 * A single hairline has to be dark enough to survive a white candle and light
 * enough not to cut a dark one in half, and there is no colour that is both.
 * The usual answer is to pick the darker one and accept that the line disappears
 * over a filled body — which is the moment a reader most wants to see where it
 * is, because that is where the price they are reading came from.
 *
 * So the line is drawn twice: once wider in a translucent wash of the same
 * colour, then the hairline on top. The wash separates the line from whatever
 * is under it without being visible as a second line, and it costs one extra
 * stroke on a canvas that holds nothing but the crosshair.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{color: string, width: number, style: number}} line
 */
function drawCrosshairLine(ctx, line, x1, y1, x2, y2) {
    const trace = () => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };

    ctx.save();

    // The halo is solid whatever the line's own style is: a dashed halo is
    // just a second dashed line, and the gaps are where the problem was.
    ctx.setLineDash([]);
    ctx.globalAlpha = CROSSHAIR_HALO_ALPHA;
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.width + CROSSHAIR_HALO_WIDTH;
    trace();
    ctx.restore();

    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.width;
    applyLineStyle(ctx, line.style, line.width);
    trace();
}

function hitBeats(candidate, winner) {
    const layer = (hit) => Z_ORDER_RANK[hit.zOrder] ?? Z_ORDER_RANK.normal;

    if (layer(candidate) !== layer(winner)) {
        return layer(candidate) > layer(winner);
    }

    const isPoint = (hit) => hit.hitTestPriority === POINT_HIT;

    if (isPoint(candidate) !== isPoint(winner)) {
        return isPoint(candidate);
    }

    return (candidate.distance ?? 0) < (winner.distance ?? 0);
}

/**
 * What a primitive claims sits under the pointer, or null.
 *
 * Every primitive is asked and the best answer wins rather than the first, so
 * two drawings that overlap resolve the way they look rather than the way they
 * were attached.
 *
 * Takes the best hit so far and returns the better of the two, so a caller can
 * walk pane after pane without building a list of candidates on every pointer
 * move — which, on a chart with no primitives at all, is the difference
 * between allocating nothing and allocating on every mouse event.
 *
 * @param {Object[]} primitives
 * @param {number} x CSS px within the chart
 * @param {number} y
 * @param {Object|null} winner best hit found so far
 * @return {Object|null}
 */
export function hitTestPrimitives(primitives, x, y, winner = null, chart) {
    for (const primitive of primitives) {
        let hit;

        try {
            hit = primitive.hitTest?.(x, y);
        } catch (error) {
            // A primitive that throws while hit testing simply is not hit.
            report(chart, error, 'primitive.hitTest');
            continue;
        }

        if (hit && (winner === null || hitBeats(hit, winner))) {
            winner = hit;
        }
    }

    return winner;
}

class Series {
    constructor(chart, pane, definition, options) {
        this.chart = chart;
        this.pane = pane;
        this.definition = definition;
        this.options = mergeOptions(definition.defaults(), options ?? {});

        // Resolved once rather than looked up per frame. A series keeps the
        // same scale for life; `priceScaleId` is not an option you can change
        // later in lightweight-charts either.
        this.scale = FULL_BUILD ? scaleRecord(pane, this.options.priceScaleId) : pane;
        this.points = [];
        this.byIndex = [];
        this.markers = [];
        this.priceLines = [];
        this.primitives = [];

        // Told when this series' data changes, which is not the same as the
        // chart redrawing: a subscriber loading history wants to know a bar
        // arrived, not that a pointer moved.
        this.dataHandlers = new Set();
        this.api = this.createApi();
    }

    /**
     * Registers a primitive — an object that draws on this series' pane using
     * the chart's own coordinates and paint order.
     *
     * @param {Object} primitive
     */
    attachPrimitive(primitive) {
        if (! primitive || this.primitives.includes(primitive)) {
            return;
        }

        this.primitives.push(primitive);

        try {
            primitive.attached?.({
                chart: this.chart.api,
                series: this.api,
                requestUpdate: () => this.chart.scheduleRender(),
            });
        } catch (error) {
            // Attaching is the primitive's own business; a failure there is
            // not a reason to leave the chart in a half-registered state.
            report(this.chart, error, 'primitive.attached');
        }

        this.chart.scheduleRender();
    }

    /**
     * @param {Object} primitive
     */
    detachPrimitive(primitive) {
        const index = this.primitives.indexOf(primitive);

        if (index < 0) {
            return;
        }

        this.primitives.splice(index, 1);

        try {
            primitive.detached?.();
        } catch (error) {
            report(this.chart, error, 'primitive.detached');
        }

        this.chart.scheduleRender();
    }

    /**
     * @param {Object} options
     * @return {Object} the handle the caller keeps to update or remove the line
     */
    createPriceLine(options) {
        const line = {
            options: mergeOptions({
                price: 0,
                color: '',
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                lineVisible: true,
                axisLabelVisible: true,
                title: '',
                axisLabelColor: '',
                axisLabelTextColor: '',
            }, options ?? {}),
        };

        line.api = {
            applyOptions: (next) => {
                mergeOptions(line.options, next ?? {});
                this.chart.scheduleRender();
            },
            options: () => line.options,
            _line: line,
        };

        this.priceLines.push(line);
        this.chart.scheduleRender();

        return line.api;
    }

    removePriceLine(handle) {
        const index = this.priceLines.findIndex((line) => line.api === handle || line === handle);

        if (index >= 0) {
            this.priceLines.splice(index, 1);
            this.chart.scheduleRender();
        }
    }

    /**
     * The handle the caller holds.
     *
     * Annotated rather than inferred: the returned object closes over `this`,
     * and from TypeScript 5.9 a declaration that references an inaccessible
     * `this` type is an error rather than a widening. The public shape is
     * described in `types.js` regardless, so nothing is lost by saying so here.
     *
     * @return {Object}
     */
    createApi() {
        const series = this;

        return {
            seriesType: () => series.definition.type,
            setData: (data) => {
                series.setData(data);
                series.chart.dataChanged();
            },
            update: (point) => {
                series.update(point);
                series.chart.dataChanged();
            },
            data: () => series.points.map((point) => point.raw),
            applyOptions: (options) => {
                mergeOptions(series.options, options ?? {});
                series.chart.scheduleRender();
            },
            options: () => series.options,
            setMarkers: (markers) => {
                series.markers = Array.isArray(markers) ? markers : [];
                series.chart.scheduleRender();
            },
            attachPrimitive: (primitive) => series.attachPrimitive(primitive),
            detachPrimitive: (primitive) => series.detachPrimitive(primitive),
            createPriceLine: (options) => series.createPriceLine(options),
            removePriceLine: (handle) => series.removePriceLine(handle),
            priceLines: () => series.priceLines.map((line) => line.api),
            markers: () => series.markers,
            priceScale: () => series.chart.priceScaleApiFor(series.scale),
            priceToCoordinate: (price) => {
                series.chart.ensureLayout();

                return series.scale.priceScale.priceToY(price);
            },
            coordinateToPrice: (y) => {
                series.chart.ensureLayout();

                return series.scale.priceScale.yToPrice(y);
            },

            /**
             * How much of this series lies inside a logical range, and how much
             * is left on either side.
             *
             * The counts either side are the whole point: they are how a chart
             * that loads history on demand knows the reader has run out of bars
             * to the left and it is time to fetch more.
             */
            barsInLogicalRange: (range) => {
                if (! range || ! series.points.length) {
                    return null;
                }

                // This series' own ends, not the chart's. On a chart carrying
                // a short series beside a long one — a moving average that
                // starts late, a second instrument with less history — the
                // merged index would report bars before the range that belong
                // to somebody else's data, and a caller loading history on
                // demand would decide it had plenty when it had none.
                const first = series.byIndex.findIndex(Boolean);
                const last = series.byIndex.length - 1 - [...series.byIndex].reverse().findIndex(Boolean);

                if (first < 0) {
                    return null;
                }

                const from = Math.max(first, Math.ceil(range.from));
                const to = Math.min(last, Math.floor(range.to));

                if (from > to) {
                    return null;
                }

                let counted = 0;

                for (let index = from; index <= to; index++) {
                    if (series.byIndex[index]) {
                        counted++;
                    }
                }

                return {
                    barsBefore: range.from - first,
                    barsAfter: last - range.to,
                    from: series.byIndex[from]?.time,
                    to: series.byIndex[to]?.time,
                    length: counted,
                };
            },

            /**
             * The reading at a logical index.
             *
             * `seekDirection` decides what happens when that index holds
             * nothing — whitespace, or a bar this series simply does not have
             * because another series on the chart is denser.
             */
            dataByIndex: (index, seekDirection) => {
                const at = Math.round(index);
                const found = series.byIndex[at];

                if (found) {
                    return found.raw;
                }

                const step = seekDirection === -1 ? -1 : (seekDirection === 1 ? 1 : 0);

                if (step === 0) {
                    return null;
                }

                for (let cursor = at + step; cursor >= 0 && cursor < series.byIndex.length; cursor += step) {
                    if (series.byIndex[cursor]) {
                        return series.byIndex[cursor].raw;
                    }
                }

                return null;
            },

            /** The formatter the axis uses, so a caller can print the same string. */
            priceFormatter: () => ({
                format: (price) => series.chart.formatPrice(price, series.scale, series),
            }),

            subscribeDataChanged: (handler) => series.dataHandlers.add(handler),
            unsubscribeDataChanged: (handler) => series.dataHandlers.delete(handler),

            /**
             * Drops the last reading.
             *
             * The partner to `update` on a streaming chart: a provisional bar
             * arrives, is drawn, and is then withdrawn rather than corrected —
             * which `setData` can only express by resending the whole history.
             */
            pop: () => {
                if (! series.points.length) {
                    return null;
                }

                const removed = series.points.pop();

                series.chart.dataChanged();

                return removed.raw;
            },

            /** Where this series sits in its pane's painting order. */
            seriesOrder: () => series.pane.series.indexOf(series),

            /**
             * Moves it in that order. Later is nearer the reader.
             *
             * Clamped rather than refused: a caller asking for the top does not
             * want to first count how many series there are.
             */
            setSeriesOrder: (order) => {
                moveInOrder(series.pane.series, series, order);
                series.chart.scheduleRender();
            },

            _internal: series,
        };
    }

    setData(data) {
        const points = [];

        let arrivedInOrder = true;

        for (const item of Array.isArray(data) ? data : []) {
            const timestamp = toTimestamp(item.time);

            if (timestamp === null) {
                continue;
            }

            const previous = points[points.length - 1];

            if (previous && timestamp < previous.ts) {
                // Noted here rather than worked out afterwards: the sort below
                // destroys the evidence, and comparing the caller's own `time`
                // values would mean guessing at their type.
                arrivedInOrder = false;
            }

            points.push(normalisePoint(item, timestamp));
        }

        points.sort((a, b) => a.ts - b.ts);

        // A custom series has no scalar value of its own: its prices come from
        // the view that draws it. Reading them once here is what lets the axis,
        // the price line and the last-value badge treat it like any other
        // series instead of each having to know about custom views.
        if (FULL_BUILD && this.definition.priceValues) {
            for (const point of points) {
                const values = this.definition.priceValues(point.raw);

                point.value = values.length ? values[values.length - 1] : null;
                point.low = values.length ? Math.min(...values) : null;
                point.high = values.length ? Math.max(...values) : null;
            }
        }

        this.points = points;

        if (this.chart.options.validateData) {
            for (const problem of dataProblems(this, data, points, arrivedInOrder)) {
                warn(this.chart, problem);
            }
        }
    }

    update(item) {
        const timestamp = toTimestamp(item.time);

        if (timestamp === null) {
            if (this.chart.options.validateData) {
                warn(this.chart, `update() was given a time it could not read: ${String(item?.time)}.`);
            }

            return;
        }

        const point = normalisePoint(item, timestamp);
        const last = this.points[this.points.length - 1];

        if (this.chart.options.validateData) {
            for (const problem of updateProblems(this, point, last)) {
                warn(this.chart, problem);
            }
        }

        // Stamped on every update, whether or not anything is animating: the
        // option can be turned on between one tick and the next, and a pulse
        // that only started working after the *second* tick would look broken
        // rather than off.
        this.pulseStartedAt = this.chart.now();

        if (last && last.ts === timestamp) {
            this.points[this.points.length - 1] = point;

            return;
        }

        if (! last || timestamp > last.ts) {
            this.points.push(point);

            return;
        }

        const index = this.points.findIndex((existing) => existing.ts >= timestamp);

        if (index >= 0 && this.points[index].ts === timestamp) {
            this.points[index] = point;
        } else {
            this.points.splice(index < 0 ? this.points.length : index, 0, point);
        }
    }

    lastPoint() {
        for (let index = this.points.length - 1; index >= 0; index--) {
            const point = this.points[index];

            if (point.value !== null && point.value !== undefined) {
                return point;
            }
        }

        return null;
    }
}

export class Chart {
    constructor(container, options) {
        this.container = container;
        this.options = mergeOptions(
            chartDefaults(),
            // Tracking is in both builds. It is how a price is read on a
            // phone, and the phone is where most of these charts are read —
            // compiling it out of the light build to save a few dozen bytes
            // saved them in the place they were least affordable.
            { trackingMode: { exitMode: 'onTouchEnd' } },
        );
        mergeOptions(
            this.options,
            FULL_BUILD
                ? {
                    layout: { panes: paneDefaults() },
                    leftPriceScale: leftScaleDefaults(),
                    kineticScroll: { touch: true, mouse: false },

                    // Focus, arrow keys, and a live region reading each value
                    // aloud. On by default: a chart nobody can reach without a
                    // pointer has its prices locked behind a mouse, and that is
                    // not something to opt into. Set false where the chart is
                    // decoration — a sparkline has nothing to announce and
                    // should not be a tab stop.
                    handleKeyboard: true,
                    timeScale: {
                        // Merge readings that would land in the same pixel
                        // column when zoomed out. Off by default, matching
                        // them: most charts hold hundreds of points, where
                        // this is all cost and no benefit.
                        enableConflation: false,

                        // How much smoothing. One merges only what cannot be
                        // told apart; higher merges more, which suits a
                        // sparkline where the shape matters more than the
                        // readings.
                        conflationThresholdFactor: 1,
                    },
                }
                : {},
        );
        this.applyTheme(options?.theme);
        mergeOptions(this.options, options ?? {});
        this.timeIndex = [];
        this.timeScale = new TimeScale(this.options.timeScale);
        this.panes = [createPane(this, this.options.rightPriceScale, MAIN_PANE_STRETCH)];
        this.plot = { left: 0, top: 0, right: 0, bottom: 0 };
        this.crosshairHandlers = new Set();
        this.clickHandlers = new Set();
        this.dblClickHandlers = new Set();

        // Told when the chart's own box changes, which a caller sizing a
        // toolbar beside it cannot learn any other way.
        this.sizeHandlers = new Set();

        // What a primitive claims is under the pointer, recomputed on every
        // move. Kept on the chart rather than passed around because both the
        // cursor and the event payload need the same answer from one test.
        this.hovered = null;
        this.logicalRangeHandlers = new Set();
        this.timeRangeHandlers = new Set();
        this.lastLogicalRange = null;
        this.autoFit = false;
        this.layoutDirty = true;
        this.priceAxisWidth = 0;
        this.leftAxisWidth = 0;
        this.renderHandle = null;
        this.crosshair = null;
        this.hoveredSeparator = -1;
        this.pointer = {
            mode: null,
            snapshot: null,
            pane: null,
            separator: -1,
            lastX: 0,
            startX: 0,
            startY: 0,
            moved: false,
            pinchDistance: 0,
            lastTouchAt: 0,
            touchSpeed: 0,

            // Set once a finger has held still long enough to mean it, and
            // cleared when it lifts. While it is set the chart does not scroll.
            tracking: false,
            touch: null,
        };

        this.longPress = createLongPress(() => this.beginTracking());

        this.buildDom();
        this.applySize(this.options.width, this.options.height);
        this.bindEvents();
        this.scheduleRender();
    }

    /**
     * Lays a palette under whatever the caller set.
     *
     * Under, not over. A caller writing `{ theme: 'dark', grid: {...} }` means
     * their grid, and a theme applied afterwards would quietly discard it —
     * which is the failure that makes people stop trusting a theme option and
     * go back to setting nine colours by hand.
     *
     * @param {string|undefined} name
     */
    applyTheme(name) {
        if (! name) {
            return;
        }

        const colours = palette(name);

        if (! colours) {
            return;
        }

        mergeOptions(this.options, colours);
        this.options.theme = name;

        // A chart set to follow the system has to keep following it. Watched
        // once and torn down with the chart; a reader who switches their OS
        // theme with a chart on screen is the whole point of `auto`.
        if (name === 'auto' && ! this.unwatchTheme) {
            this.unwatchTheme = watchPreferred(() => {
                mergeOptions(this.options, palette('auto'));
                this.scheduleRender();
            });
        }

        if (name !== 'auto' && this.unwatchTheme) {
            this.unwatchTheme();
            this.unwatchTheme = null;
        }
    }

    buildDom() {
        this.element = document.createElement('div');
        this.element.className = 'arincen-chart-root';

        // A long press on the chart is ours: it is how a reader without a
        // mouse gets a crosshair. The browser thinks a long press means select
        // this, or offer to copy and search it, and puts its own bubble over
        // the chart while the crosshair is being placed underneath.
        //
        // `user-select` stops the selection, and the WebKit callout is a
        // separate refusal on iOS — without both, the phone answers the
        // gesture first and the chart looks broken while working perfectly.
        this.element.style.cssText = [
            'position:relative',
            'overflow:hidden',
            'user-select:none',
            '-webkit-user-select:none',
            '-webkit-touch-callout:none',
            '',
        ].join(';');

        this.mainCanvas = document.createElement('canvas');
        this.mainCanvas.style.cssText = 'position:absolute;inset:0;display:block;';

        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.style.cssText = 'position:absolute;inset:0;display:block;';

        this.element.appendChild(this.mainCanvas);
        this.element.appendChild(this.overlayCanvas);
        this.container.appendChild(this.element);

        this.mainCtx = this.contextOf(this.mainCanvas);
        this.overlayCtx = this.contextOf(this.overlayCanvas);
        this.updateAttribution();
    }

    /**
     * Adds or removes the attribution mark to match the current options.
     */
    updateAttribution() {
        const wanted = this.options.layout.attributionLogo;

        if (wanted && ! this.attributionMark) {
            this.attributionMark = createAttributionMark(this.element, this.options.layout);
        } else if (! wanted && this.attributionMark) {
            this.attributionMark.remove();
            this.attributionMark = null;
        }

        // Clear of the time axis, whatever height it has taken. Six pixels off
        // the bottom put the mark inside the strip the dates are drawn in, and
        // the first label went straight through it.
        placeAttributionMark(
            this.attributionMark,
            this.options.layout,
            Math.max(6, this.height - this.plot.bottom + 4),
        );
    }

    applySize(width, height) {
        const rect = this.container.getBoundingClientRect();
        const previousWidth = this.width;
        const previousHeight = this.height;

        this.width = Math.max(0, Math.floor(width || rect.width || this.container.clientWidth));
        this.height = Math.max(0, Math.floor(height || rect.height || this.container.clientHeight));

        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;

        const ratio = window.devicePixelRatio || 1;

        for (const canvas of [this.mainCanvas, this.overlayCanvas]) {
            canvas.width = Math.floor(this.width * ratio);
            canvas.height = Math.floor(this.height * ratio);
            canvas.style.width = `${this.width}px`;
            canvas.style.height = `${this.height}px`;
            this.contextOf(canvas).setTransform(ratio, 0, 0, ratio, 0, 0);
        }

        // Announced only on a real change. A resize observer fires on every
        // layout pass, and a subscriber that rebuilt a toolbar each time would
        // be doing it for nothing on most of them.
        if (this.width !== previousWidth || this.height !== previousHeight) {
            for (const handler of this.sizeHandlers) {
                handler({ width: this.width, height: this.height });
            }
        }
    }

    /**
     * The drawing context, in the colour space the chart was asked for.
     *
     * Requested once per canvas and then reused: a context's colour space is
     * fixed when it is first taken, so asking again with a different one
     * quietly returns the first. A browser that does not know the option
     * ignores it and returns an ordinary sRGB context, which is the answer we
     * want anyway.
     *
     * @param {HTMLCanvasElement} canvas
     * @return {CanvasRenderingContext2D}
     */
    contextOf(canvas) {
        return canvas.getContext('2d', { colorSpace: this.options.layout.colorSpace || 'srgb' });
    }

    startAutoSize() {
        if (this.resizeObserver || typeof ResizeObserver === 'undefined') {
            return;
        }

        // Through `resize` rather than straight to `applySize`, so an
        // auto-sizing chart honours the range lock too. Most charts that want
        // the lock are auto-sizing — it is a reflowing layout that provokes
        // the need — so wiring it only into the manual path would have served
        // the case that barely arises.
        this.resizeObserver = new ResizeObserver(() => this.resize(0, 0));

        this.resizeObserver.observe(this.container);
    }

    /**
     * Lets go of the container, leaving the chart whatever size it is now.
     *
     * Disconnected rather than unobserved: the observer watches one element
     * and is rebuilt by `startAutoSize`, so keeping an empty one alive would
     * only be a thing to leak.
     */
    stopAutoSize() {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
    }

    /* ---------------------------------------------------------------- data */

    /**
     * Takes a series definition object, never a name.
     *
     * Resolving names would mean holding a map of every series here, which
     * pins all of them into any bundle that draws a chart — a page showing one
     * area chart would still ship the candlestick and histogram renderers.
     *
     * @param {Object} definition
     * @param {Object} [options]
     * @param {number} [paneIndex] full build only; panes are created on demand
     */
    addSeries(definition, options, paneIndex) {
        if (! definition || typeof definition.defaults !== 'function') {
            throw new Error(
                'addSeries expects a series definition. Import the one you need '
                + '(AreaSeries, LineSeries, CandlestickSeries, BarSeries, HistogramSeries) and pass it directly.',
            );
        }

        const pane = FULL_BUILD && paneIndex > 0 ? ensurePane(this, paneIndex) : this.panes[0];
        const series = new Series(this, pane, definition, options);

        pane.series.push(series);
        this.dataChanged();

        return series.api;
    }

    removeSeries(seriesApi) {
        for (const pane of this.panes) {
            const index = pane.series.findIndex((series) => series.api === seriesApi);

            if (index >= 0) {
                const [removed] = pane.series.splice(index, 1);

                // A custom series is somebody else's object, and it may be
                // holding a cache, an offscreen canvas or a worker. We told it
                // when it arrived; it is owed the other half of that.
                try {
                    removed.definition.paneView?.destroy?.();
                } catch (error) {
                    // Its own clean-up failing is not a reason to leave the
                    // chart half-holding a series it has already dropped.
                    report(this, error, 'customSeries.destroy');
                }

                for (const primitive of [...removed.primitives]) {
                    removed.detachPrimitive(primitive);
                }

                this.dataChanged();

                return;
            }
        }
    }

    /**
     * Every series on the chart, in pane order. Pane-scoped drawing uses
     * `pane.series` directly; this is for the chart-wide passes — building the
     * shared time index, answering a crosshair — which do not care where a
     * series is drawn.
     *
     * @return {Series[]}
     */
    get allSeries() {
        return this.panes.length === 1
            ? this.panes[0].series
            : this.panes.flatMap((pane) => pane.series);
    }

    /**
     * Rebuilds the merged time index every series is positioned against, then
     * maps each series' points onto it.
     */
    dataChanged() {
        const all = this.allSeries;
        const timestamps = new Set();

        for (const series of all) {
            for (const point of series.points) {
                timestamps.add(point.ts);
            }
        }

        this.timeIndex = Array.from(timestamps).sort((a, b) => a - b);

        const position = new Map();

        this.timeIndex.forEach((timestamp, index) => position.set(timestamp, index));

        for (const series of all) {
            series.byIndex = new Array(this.timeIndex.length);

            for (const point of series.points) {
                series.byIndex[position.get(point.ts)] = point;
            }
        }

        // Built once here rather than merged per frame: merging on every
        // frame would walk every point on every frame, which is the cost this
        // exists to avoid.
        //
        // Cleared when the option is off, not merely left unbuilt. A ladder
        // that outlived the option it was built for meant a caller could turn
        // conflation off and go on getting it, silently — and the ladder is
        // the largest thing a series holds, so it is also a leak.
        if (FULL_BUILD) {
            const wanted = this.options.timeScale.enableConflation;

            for (const series of all) {
                series.conflation = wanted
                    ? buildConflationLevels(series.byIndex, series.definition.isBarLike)
                    : null;
            }
        }

        this.timeScale.setPoints(this.timeIndex);
        // How much room the outermost reading needs so the edge does not slice
        // it: half a bar for a candle, half a stroke for a line. Both decided
        // in one pass over the series rather than two.
        let bars = 0;
        let pixels = 0;

        for (const series of all) {
            if (series.definition.isBarLike) {
                bars = 0.5;

                continue;
            }

            const width = series.options.lineWidth ?? 0;

            pixels = Math.max(pixels, width / 2);

            // Point markers are a full-build option, so the light build has no
            // reason to carry the branch that measures them.
            if (FULL_BUILD && series.options.pointMarkersVisible) {
                pixels = Math.max(pixels, series.options.pointMarkersRadius ?? Math.max(2, width + 1));
            }
        }

        this.timeScale.padBars = bars;
        this.timeScale.padPixels = pixels;

        // Told after the index is rebuilt, not before: a subscriber's first
        // instinct is to ask where the new bar landed, and answering from a
        // half-updated scale is worse than not answering.
        for (const series of all) {
            for (const handler of series.dataHandlers) {
                handler();
            }
        }

        this.scheduleRender();
    }

    /* ------------------------------------------------------------- rendering */

    scheduleRender() {
        this.layoutDirty = true;

        if (this.renderHandle !== null || this.removed) {
            return;
        }

        this.renderHandle = requestAnimationFrame(() => {
            this.renderHandle = null;
            this.render();
        });
    }

    layout() {
        const { layout, timeScale: timeScaleOptions } = this.options;
        const timeAxisHeight = timeScaleOptions.visible ? layout.fontSize + 14 : 0;

        this.plot = {
            left: FULL_BUILD ? Math.min(this.leftAxisWidth, this.width) : 0,
            top: 0,
            right: Math.max(0, this.width - this.priceAxisWidth),
            bottom: Math.max(0, this.height - timeAxisHeight),
        };

        this.timeScale.width = Math.max(0, this.plot.right - this.plot.left);
        this.timeScale.left = this.plot.left;

        // Here rather than only in `updateAttribution`: the time axis changes
        // height with the font, with `timeVisible`, and with whether it is
        // drawn at all, and the mark has to stay clear of it through every one
        // of those.
        placeAttributionMark(
            this.attributionMark,
            this.options.layout,
            Math.max(6, this.height - this.plot.bottom + 4),
        );

        if (FULL_BUILD && this.panes.length > 1) {
            layoutPanes(this);
        } else {
            this.panes[0].plot = { ...this.plot };
        }

        for (const pane of this.panes) {
            pane.priceScale.setViewport(pane.plot.top, pane.plot.bottom);

            if (FULL_BUILD && pane.extraScales) {
                for (const record of pane.extraScales.values()) {
                    record.priceScale.setViewport(pane.plot.top, pane.plot.bottom);
                }
            }
        }

        if (this.autoFit) {
            this.timeScale.fitContent();
        } else {
            this.timeScale.clampToEdges();
        }

        for (const pane of this.panes) {
            if (FULL_BUILD) {
                for (const record of paneScales(pane)) {
                    this.updatePriceRange(pane, record);
                }
            } else {
                this.updatePriceRange(pane, pane);
            }
        }
    }

    /**
     * @param {Object} pane the pane whose height the scale spans
     * @param {Object} record the scale being ranged, which may be the pane itself
     */
    updatePriceRange(pane, record) {
        // A scale is ranged against the series drawn on it, not on everything
        // in the pane — that separation is the whole point of a second scale.
        const scaled = FULL_BUILD
            ? pane.series.filter((series) => series.scale === record)
            : pane.series;

        if (FULL_BUILD && record.options.mode >= PriceScaleMode.Percentage) {
            const { from } = this.timeScale.visibleIndices();
            const first = scaled
                .map((series) => series.byIndex[from])
                .find((point) => point && point.value !== null && point.value !== undefined);

            record.priceScale.percentageBase = first ? first.value : null;
        }

        if (! record.autoScale && record.manualRange) {
            record.priceScale.setRange(record.manualRange.min, record.manualRange.max);

            return;
        }

        const { from, to } = this.timeScale.visibleIndices();

        let min = Infinity;
        let max = -Infinity;

        for (const series of scaled) {
            if (! series.options.visible) {
                continue;
            }

            // Primitives widen the series' own range before the provider is
            // consulted, so a caller who overrides autoscaling entirely still
            // gets the last word — which is what overriding it means.
            const range = widenForPrimitives(
                series.primitives,
                seriesPriceRange(series, from, to),
                from,
                to,
                this,
            );

            if (! range) {
                continue;
            }

            const adjusted = FULL_BUILD && typeof series.options.autoscaleInfoProvider === 'function'
                ? applyAutoscaleProvider(series, range)
                : range;

            min = Math.min(min, adjusted.minValue);
            max = Math.max(max, adjusted.maxValue);
        }

        if (min === Infinity) {
            // Nothing to scale. The scale still needs numbers so `priceToY`
            // answers rather than returning NaN, and `setRange` is given
            // something outside the finite range on purpose: it is what marks
            // the range as invented, which is what keeps the axis from
            // labelling an empty chart 0.00 to 1.00.
            record.priceScale.setRange(NaN, NaN);

            return;
        }

        // Markers hang above and below their bar, so the range has to reserve
        // room for them or an arrow on the highest bar is clipped away.
        const plotHeight = pane.plot.bottom - pane.plot.top;

        if (scaled.some((series) => series.markers.length) && plotHeight > 0) {
            const headroom = (max - min) * (MARKER_HEADROOM / plotHeight);

            min -= headroom;
            max += headroom;
        }

        record.priceScale.setRange(min, max);
    }

    font() {
        return `${this.options.layout.fontSize}px ${this.options.layout.fontFamily}`;
    }

    /**
     * @param {number} price
     * @param {Object} pane
     * @param {Object} [series] the series this price belongs to, when it has one
     */
    formatPrice(price, scale, series) {
        if (FULL_BUILD && scale.options.mode >= PriceScaleMode.Percentage) {
            const base = scale.priceScale.percentageBase;

            if (base) {
                // The axis is a move, not a price, so a caller's price
                // formatter — currency symbols and all — would be wrong here.
                // There is a separate one for exactly this, because how many
                // decimals a move deserves is a different question from how
                // many a price does.
                const percent = (price / base - 1) * 100;
                const custom = this.options.localization.percentageFormatter?.(percent);

                if (scale.options.mode === PriceScaleMode.Percentage) {
                    return custom ?? `${percent.toFixed(2)}%`;
                }

                return ((price / base) * 100).toFixed(2);
            }
        }

        const formatter = this.options.localization.priceFormatter;

        if (typeof formatter === 'function') {
            return formatter(price);
        }

        return formatWithPriceFormat(price, series ?? scale.series?.[0], scale.priceScale.precision());
    }

    /**
     * Brings the scales up to date without painting.
     *
     * Rendering is deferred to an animation frame, so anything asked before the
     * first paint — `priceToCoordinate` on a series, a visible range — would
     * otherwise be answered from an unmeasured scale and come back as zero. A
     * caller reading coordinates straight after `setData` has every right to a
     * real answer.
     */
    ensureLayout() {
        if (! this.layoutDirty || ! this.width || ! this.height || this.removed) {
            return;
        }

        this.layout();

        const ctx = this.mainCtx;

        // Here rather than in `render`, because this is where text is first
        // measured. `measureText` reads `direction`, and the price axis sizes
        // itself from those widths — so setting it later means the axis was
        // laid out under one direction and painted under another.
        ctx.direction = this.textDirection();

        ctx.font = this.font();

        // One axis column serves every pane, so it is measured against the
        // widest label any of them will print — otherwise the panes would
        // disagree on where the plot ends and the grid would step sideways.
        const widest = (records) => records.reduce((width, record) => record.priceScale.ticks().reduce(
            (widestLabel, tick) => Math.max(widestLabel, ctx.measureText(this.formatPrice(tick.price, record)).width),
            width,
        ), 0);

        const gutter = (records, options) => (options.visible
            ? Math.max(Math.ceil(widest(records)) + AXIS_PADDING, options.minimumWidth ?? 0)
            : 0);

        const desiredWidth = gutter(this.panes, this.options.rightPriceScale);
        const lefts = FULL_BUILD ? this.panes.map(leftScale).filter(Boolean) : [];
        const desiredLeft = FULL_BUILD && lefts.length
            ? gutter(lefts, this.options.leftPriceScale)
            : 0;

        // The axis width depends on the labels, which depend on the plot width,
        // which depends on the axis width — one correction settles it.
        if (Math.abs(desiredWidth - this.priceAxisWidth) > 0.5
            || (FULL_BUILD && Math.abs(desiredLeft - this.leftAxisWidth) > 0.5)) {
            this.priceAxisWidth = desiredWidth;
            this.leftAxisWidth = desiredLeft;
            this.layout();
        }

        this.layoutDirty = false;
    }

    render() {
        if (! this.width || ! this.height || this.removed) {
            return;
        }

        this.layoutDirty = true;
        this.ensureLayout();

        const ctx = this.mainCtx;
        const timeTicks = this.buildTimeTicks(ctx);
        const paneTicks = this.panes.map((pane) => pane.priceScale.ticks());

        this.drawBackground(ctx);

        // Under the grid: the shading says which hours these are, and a grid
        // line drawn beneath a translucent wash reads as two different greys
        // for the same line.
        if (FULL_BUILD) {
            drawSessions(ctx, this);

            // Above the session shading and below everything else: a region
            // somebody has marked is about the readings, so it goes behind
            // them, but it is not part of the market's own timetable.
            drawAnnotations(ctx, this);
        }

        this.drawGrid(ctx, paneTicks, timeTicks);

        this.panes.forEach((pane, index) => {
            this.drawSeries(ctx, pane);
            this.drawPriceAxis(ctx, pane, pane, paneTicks[index]);

            if (FULL_BUILD) {
                const left = leftScale(pane);

                if (left) {
                    this.drawPriceAxis(ctx, pane, left, left.priceScale.ticks(), true);
                }
            }
        });

        this.drawTimeAxis(ctx, timeTicks);
        this.drawPlaceholder(ctx);
        this.drawAxisPrimitives(ctx);
        this.emitVisibleRange();

        if (FULL_BUILD && this.panes.length > 1) {
            drawPaneSeparators(ctx, this, this.hoveredSeparator);
        }

        this.drawCrosshair();
    }

    /**
     * Lets primitives draw inside the axis strips themselves.
     *
     * Separate from the pane views because the axes are not the plot: a
     * renderer given the whole canvas would have to know where the axis starts
     * and be trusted not to paint over the chart. Here it is handed a target
     * sized to the strip and clipped to it, so its coordinates start at the
     * strip's own corner and it cannot escape.
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    drawAxisPrimitives(ctx) {
        for (const strip of axisStrips(this.plot, this.width, this.height)) {
            if (! strip.width || ! strip.height) {
                continue;
            }

            // Clipped in absolute coordinates before the origin is applied: a
            // clip is stored in device space once set, so it stays where it
            // was put however the transform changes afterwards.
            ctx.save();
            ctx.beginPath();
            ctx.rect(strip.left, strip.top, strip.width, strip.height);
            ctx.clip();

            const target = createRenderTarget(
                ctx,
                { width: strip.width, height: strip.height },
                window.devicePixelRatio || 1,
                { x: strip.left, y: strip.top },
            );

            for (const pane of this.panes) {
                drawPrimitives(pane.primitives, 'normal', target, strip.views, this);

                for (const series of pane.series) {
                    drawPrimitives(series.primitives, 'normal', target, strip.views, this);
                }
            }

            ctx.restore();
        }
    }

    /**
     * Tells subscribers when the viewport has moved.
     *
     * Emitted after layout rather than from the gestures themselves: a range
     * changes from panning, zooming, a resize, `fitContent`, and new data
     * arriving, and only one of those is a gesture. Paging in older bars — the
     * usual reason to listen — has to hear about all of them.
     */
    emitVisibleRange() {
        if (! this.logicalRangeHandlers.size && ! this.timeRangeHandlers.size) {
            return;
        }

        const range = this.timeIndex.length ? this.timeScale.logicalRange() : null;
        const last = this.lastLogicalRange;
        const same = range && last
            ? Math.abs(range.from - last.from) < 1e-9 && Math.abs(range.to - last.to) < 1e-9
            : range === last;

        if (same) {
            return;
        }

        this.lastLogicalRange = range;

        for (const handler of this.logicalRangeHandlers) {
            handler(range);
        }

        if (this.timeRangeHandlers.size) {
            const { from, to } = this.timeScale.visibleIndices();
            const times = to < from ? null : { from: this.timeIndex[from], to: this.timeIndex[to] };

            for (const handler of this.timeRangeHandlers) {
                handler(times);
            }
        }
    }

    drawBackground(ctx) {
        const { background } = this.options.layout;

        ctx.clearRect(0, 0, this.width, this.height);

        if (background.type === 'gradient') {
            const gradient = ctx.createLinearGradient(0, 0, 0, this.height);

            gradient.addColorStop(0, background.topColor);
            gradient.addColorStop(1, background.bottomColor);
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = background.color;
        }

        ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * A line of text where the data would be.
     *
     * Only when there is nothing at all to draw. A chart mid-fetch used to show
     * a grid and an axis running 0.00 to 1.00, which on a financial chart is
     * not an empty state — it is a chart stating prices it does not have. The
     * axis is silent now, and this says why.
     *
     * `loading` wins over empty, and is the caller's to set: only they know a
     * request is in flight. Without it a chart flashes "No data" on its way to
     * having some, which reads as a failure that then corrects itself.
     */
    drawPlaceholder(ctx) {
        if (this.hasReadings()) {
            return;
        }

        const { emptyText, loadingText } = this.options.localization;
        const text = this.options.loading ? loadingText : emptyText;

        if (! text) {
            return;
        }

        ctx.save();
        ctx.font = this.font();
        ctx.fillStyle = this.options.layout.textColor;
        ctx.globalAlpha = PLACEHOLDER_ALPHA;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            text,
            (this.plot.left + this.plot.right) / 2,
            (this.plot.top + this.plot.bottom) / 2,
        );
        ctx.restore();
    }

    /** Whether any series anywhere holds a reading. */
    hasReadings() {
        return this.allSeries.some((series) => series.points.length > 0);
    }

    drawGrid(ctx, paneTicks, timeTicks) {
        const { vertLines, horzLines } = this.options.grid;

        ctx.save();
        ctx.lineWidth = 1;

        if (horzLines.visible) {
            ctx.strokeStyle = horzLines.color;
            applyLineStyle(ctx, horzLines.style, 1);
            ctx.beginPath();

            for (const ticks of paneTicks) {
                for (const tick of ticks) {
                    const y = Math.round(tick.y) + 0.5;

                    ctx.moveTo(this.plot.left, y);
                    ctx.lineTo(this.plot.right, y);
                }
            }

            ctx.stroke();
        }

        if (vertLines.visible) {
            ctx.strokeStyle = vertLines.color;
            applyLineStyle(ctx, vertLines.style, 1);
            ctx.beginPath();

            for (const tick of timeTicks) {
                const x = Math.round(tick.x) + 0.5;

                ctx.moveTo(x, this.plot.top);
                ctx.lineTo(x, this.plot.bottom);
            }

            ctx.stroke();
        }

        ctx.restore();
    }

    drawSeries(ctx, pane) {
        const { from, to } = this.timeScale.visibleIndices();
        const pixelRatio = window.devicePixelRatio || 1;
        const target = createRenderTarget(ctx, { width: this.width, height: this.height }, pixelRatio);
        const plot = pane.plot;

        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
        ctx.clip();

        if (FULL_BUILD) {
            refreshPrimitives(pane.primitives, this);
            drawPrimitives(pane.primitives, 'bottom', target, undefined, this);
        }

        if (FULL_BUILD) {
            this.drawBaseLine(ctx, pane);
        }

        // Only when there is something to compare against: fading on a chart
        // with one series is a chart that dims itself for no reason.
        const focus = pane.series.filter((series) => series.options.visible).length > 1
            ? this.focusedSeries
            : null;

        for (const series of pane.series) {
            if (! series.options.visible) {
                continue;
            }

            const dimmed = focus !== null && focus !== undefined && series !== focus;

            if (dimmed) {
                ctx.save();
                ctx.globalAlpha = DIMMED_ALPHA;
            }

            const view = FULL_BUILD ? this.conflatedView(series) : null;

            const context = {
                series,
                conflated: view?.points ?? null,
                step: view?.step ?? 1,
                options: series.options,
                priceScale: series.scale.priceScale,
                timeScale: this.timeScale,
                timeIndex: this.timeIndex,
                plot,
                font: this.font(),
                pixelRatio,
                target,
                from,
                to,
            };

            // Views are refreshed once per frame, before anything is asked to
            // paint, so every layer of one primitive sees the same state.
            refreshPrimitives(series.primitives, this);

            drawPrimitives(series.primitives, 'bottom', target, undefined, this);
            series.definition.draw(ctx, context);
            drawPrimitives(series.primitives, 'normal', target, undefined, this);
            drawMarkers(ctx, context);

            if (series.options.priceLineVisible) {
                this.drawPriceLine(ctx, pane, series);
            }

            this.drawCustomPriceLines(ctx, pane, series);

            if (FULL_BUILD) {
                this.drawLastPricePulse(ctx, series);
            }

            drawPrimitives(series.primitives, 'top', target, undefined, this);

            if (dimmed) {
                ctx.restore();
            }
        }

        if (FULL_BUILD) {
            drawPrimitives(pane.primitives, 'normal', target, undefined, this);
            drawPrimitives(pane.primitives, 'top', target, undefined, this);
        }

        ctx.restore();
    }

    /**
     * A ring breathing outward from the newest point.
     *
     * The one thing a still picture of a chart cannot say is whether it is
     * still live. A price that stopped updating an hour ago looks exactly like
     * one arriving now, and on a page carrying a streaming quote that is the
     * difference between a number you can trade on and one you cannot.
     *
     * `OnDataUpdate` pulses once per change and then rests, for a series that
     * updates in bursts; `Continuous` never rests, for one that should always
     * look live.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Series} series
     */
    drawLastPricePulse(ctx, series) {
        const mode = series.options.lastPriceAnimation;

        // Asked each frame rather than once: a reader can turn the setting on
        // with the chart in front of them, and the next frame should be still.
        if (! mode || ! series.definition.lastValueColor || prefersReducedMotion()) {
            return;
        }

        const point = series.lastPoint();

        if (! point || point.value === null || point.value === undefined) {
            return;
        }

        const progress = mode === LastPriceAnimationMode.Continuous
            ? continuousPhase(this.now())
            : pulsePhase(series.pulseStartedAt, this.now());

        if (progress === null) {
            return;
        }

        const index = series.byIndex.lastIndexOf(point);

        if (index < 0) {
            return;
        }

        drawPulse(
            ctx,
            this.timeScale.indexToX(index),
            series.scale.priceScale.priceToY(point.value),
            progress,
            series.definition.lastValueColor(series.options, point),
        );

        // The next frame is the animation. Asked for only while a pulse is
        // actually running, so a chart whose animation is off — which is the
        // default — never schedules a frame it does not need.
        this.scheduleRender();
    }

    /** Overridable in tests; the chart never reads the clock anywhere else. */
    now() {
        return performance.now();
    }

    /**
     * The zero line of a rebased axis.
     *
     * On a percentage or indexed scale every value is a move away from a
     * starting point, and without that starting point drawn, "up four per
     * cent" and "down four per cent" are the same picture until you stop and
     * read the axis. Drawn under the series, because it is a reference and not
     * a reading.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} pane
     */
    drawBaseLine(ctx, pane) {
        for (const scale of paneScales(pane)) {
            const mode = scale.options.mode;
            const rebased = mode === PriceScaleMode.Percentage || mode === PriceScaleMode.IndexedTo100;
            const series = scale.series?.find((candidate) => candidate.options.visible);

            if (! rebased || ! series || ! series.options.baseLineVisible) {
                continue;
            }

            const base = scale.priceScale.percentageBase;

            if (! Number.isFinite(base)) {
                continue;
            }

            const y = Math.round(scale.priceScale.priceToY(base)) + 0.5;

            if (y < pane.plot.top || y > pane.plot.bottom) {
                continue;
            }

            const { baseLineColor, baseLineWidth, baseLineStyle } = series.options;

            ctx.save();
            ctx.strokeStyle = baseLineColor;
            ctx.lineWidth = baseLineWidth;
            applyLineStyle(ctx, baseLineStyle, baseLineWidth);
            ctx.beginPath();
            ctx.moveTo(pane.plot.left, y);
            ctx.lineTo(pane.plot.right, y);
            ctx.stroke();
            ctx.restore();
        }
    }

    /**
     * Lines the caller pinned at a price — alerts, targets, entries. Drawn with
     * the series so they stay clipped to the plot; their axis badges are drawn
     * later with the price scale.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} pane
     * @param {Series} series
     */
    drawCustomPriceLines(ctx, pane, series) {
        for (const line of series.priceLines) {
            const { price, color, lineWidth, lineStyle, lineVisible, title } = line.options;

            if (! lineVisible || ! Number.isFinite(price)) {
                continue;
            }

            const y = Math.round(series.scale.priceScale.priceToY(price)) + 0.5;

            if (y < pane.plot.top || y > pane.plot.bottom) {
                continue;
            }

            ctx.save();
            ctx.strokeStyle = color || this.options.layout.textColor;
            ctx.lineWidth = lineWidth;
            applyLineStyle(ctx, lineStyle, lineWidth);
            ctx.beginPath();
            ctx.moveTo(pane.plot.left, y);
            ctx.lineTo(pane.plot.right, y);
            ctx.stroke();
            ctx.setLineDash([]);

            if (title) {
                ctx.font = this.font();
                ctx.fillStyle = color || this.options.layout.textColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(title, pane.plot.left + LABEL_PADDING_X, y - 3);
            }

            ctx.restore();
        }
    }

    /**
     * The reading the price line and the last-value badge should follow.
     *
     * `LastBar` is the newest bar in the data, on screen or not. `LastVisible`
     * is the newest one actually in view, so scrolling back through history
     * takes the line with you instead of leaving it pinned to a price that
     * scrolled off the right edge — where it reads as the current price and is
     * not.
     *
     * @param {Series} series
     * @return {Object|null}
     */
    priceSourcePoint(series) {
        return FULL_BUILD
            ? sourcePoint(series, this.timeScale.visibleIndices().to)
            : series.lastPoint();
    }

    /**
     * The coarsest view of a series that still draws every distinguishable
     * reading, or null to draw the data as it stands.
     *
     * @param {Series} series
     * @return {{step: number, points: Object[]}|null}
     */
    conflatedView(series) {
        if (! series.conflation) {
            return null;
        }

        const factor = series.options.conflationThresholdFactor
            ?? this.options.timeScale.conflationThresholdFactor;

        return levelFor(series.conflation, conflationStep(this.timeScale.barSpacing, factor));
    }

    drawPriceLine(ctx, pane, series) {
        const point = this.priceSourcePoint(series);

        if (! point) {
            return;
        }

        const y = Math.round(series.scale.priceScale.priceToY(point.value)) + 0.5;

        ctx.save();
        ctx.strokeStyle = series.options.priceLineColor
            || series.definition.lastValueColor(series.options, point);
        ctx.lineWidth = series.options.priceLineWidth;
        applyLineStyle(ctx, series.options.priceLineStyle, series.options.priceLineWidth);
        ctx.beginPath();
        ctx.moveTo(pane.plot.left, y);
        ctx.lineTo(pane.plot.right, y);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} pane
     * @param {Object} record the scale this axis belongs to
     * @param {{price: number, y: number}[]} ticks
     * @param {boolean} [onLeft]
     */
    /**
     * The series whose fill the axes borrow, or null.
     *
     * One, deliberately, and the first that asks. Two washes over the same
     * strip is mud, and picking by drawing order at least gives an answer a
     * caller can predict and change.
     */
    tintingSeries(pane) {
        return pane.series.find(
            (series) => series.options.visible && series.options.tintAxes && series.points.length,
        ) ?? null;
    }

    /**
     * The fill's own gradient, extended past the plot.
     *
     * One gradient for both strips, running from the top of the plot to the
     * bottom of the whole chart, so a strip is painted with the colour the fill
     * would have had there. Two gradients, or an extra alpha over one of them,
     * and the strips are a near-match rather than a continuation — which is
     * worse than leaving them grey, because a seam draws the eye to exactly the
     * place the effect was supposed to disappear.
     */
    fillGradient(ctx, series) {
        const options = series.options;
        const top = options.invertFilledArea ? options.bottomColor : options.topColor;
        const bottom = options.invertFilledArea ? options.topColor : options.bottomColor;

        if (! top) {
            return null;
        }

        const span = this.height - this.plot.top;
        const gradient = ctx.createLinearGradient(0, this.plot.top, 0, this.height);

        gradient.addColorStop(0, top);
        gradient.addColorStop(Math.min(1, Math.max(0, (this.plot.bottom - this.plot.top) / span)), bottom ?? top);
        gradient.addColorStop(1, bottom ?? top);

        return gradient;
    }

    /**
     * Where the fill's own top edge sits at the right-hand end of the plot.
     *
     * The dress reaches the gutter at the height of the last reading, not at
     * the top of the chart — filling the whole strip paints colour above the
     * line, which the fill itself never does, so the two stop being the same
     * shape.
     *
     * @return {number|null} y in CSS px
     */
    fillEdge(series) {
        const { to } = this.timeScale.visibleIndices();

        for (let index = Math.min(to, series.byIndex.length - 1); index >= 0; index--) {
            const point = series.byIndex[index];
            const value = point?.close ?? point?.value;

            if (value !== null && value !== undefined) {
                return series.scale.priceScale.priceToY(value);
            }
        }

        return null;
    }

    drawPriceAxis(ctx, pane, record, ticks, onLeft) {
        if (! record.options.visible) {
            return;
        }

        const tinting = this.tintingSeries(pane);
        const fillTop = tinting ? this.fillEdge(tinting) : null;

        if (tinting && fillTop !== null) {
            const gradient = this.fillGradient(ctx, tinting);
            const from = Math.max(pane.plot.top, fillTop);

            if (gradient && from < pane.plot.bottom) {
                ctx.save();
                ctx.fillStyle = gradient;
                ctx.fillRect(
                    onLeft ? 0 : this.plot.right,
                    from,
                    onLeft ? this.plot.left : this.width - this.plot.right,
                    pane.plot.bottom - from,
                );
                ctx.restore();
            }
        }

        const { borderVisible, borderColor } = record.options;
        const badgeHeight = this.options.layout.fontSize + 6;
        const collected = this.collectAxisBadges(pane, record);
        const badges = FULL_BUILD && record.options.alignLabels
            ? spreadBadges(collected, badgeHeight, pane.plot.top, pane.plot.bottom)
            : collected;
        const edge = onLeft ? this.plot.left : this.plot.right;

        ctx.save();
        ctx.font = this.font();
        ctx.textAlign = onLeft ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.options.layout.textColor;

        // A pane below another has a hard edge at its top, and a label centred
        // on that edge spills into the pane above — where it reads as that
        // pane's number. The margin is half the glyph box, not half the badge:
        // a badge carries padding a bare tick label does not, and charging the
        // label for it costs the topmost tick of every lower pane.
        const topLimit = FULL_BUILD && pane.plot.top > this.plot.top
            ? pane.plot.top + this.options.layout.fontSize / 2
            : pane.plot.top;

        for (const tick of ticks) {
            if (tick.y < topLimit || tick.y > pane.plot.bottom) {
                continue;
            }

            // A badge is painted over the axis, so a tick label behind one is
            // only ever half-legible. Drop it rather than let it show through.
            const hidden = badges.some((badge) => Math.abs(badge.y - tick.y) < badgeHeight);

            if (hidden) {
                continue;
            }

            ctx.fillText(
                this.formatPrice(tick.price, record),
                onLeft ? edge - LABEL_PADDING_X : edge + LABEL_PADDING_X,
                tick.y,
            );

            // A short mark joining the label to the axis line, for readers who
            // want to see which gridline a number belongs to on a busy scale.
            if (record.options.ticksVisible) {
                ctx.fillRect(onLeft ? edge - TICK_MARK : edge, Math.round(tick.y), TICK_MARK, 1);
            }
        }

        // Not drawn where the tint crosses it. The border marks the boundary
        // between plot and gutter, and the tint exists to say there isn't one —
        // a pale line down the middle of a continuous colour is the seam the
        // effect was removing, reintroduced a pixel wide.
        if (borderVisible && ! tinting) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.round(edge) + 0.5, pane.plot.top);
            ctx.lineTo(Math.round(edge) + 0.5, pane.plot.bottom);
            ctx.stroke();
        }

        for (const badge of badges) {
            // A corner label the pane cannot hold whole is dropped rather than
            // clipped: half a price reads as a whole one, and a number that is
            // quietly wrong is worse than a number that is missing.
            if (FULL_BUILD && record.options.entireTextOnly
                && (badge.y - badgeHeight / 2 < pane.plot.top || badge.y + badgeHeight / 2 > pane.plot.bottom)) {
                continue;
            }

            if (badge.title) {
                this.drawSeriesTitleTag(ctx, pane, badge.title, badge.y, badge.background);
            }

            this.drawAxisBadge(ctx, pane, badge.text, badge.y, badge.background, badge.textColor, onLeft);

            // A short mark joining the badge to the axis line, for a plugin
            // that wants its label tied to a level rather than floating beside
            // one. Only ever drawn for a view that asked for it.
            if (badge.tick) {
                ctx.fillStyle = badge.background;
                ctx.fillRect(onLeft ? edge - TICK_MARK : edge, Math.round(badge.y), TICK_MARK, 1);
            }
        }

        ctx.restore();
    }

    /**
     * Every label the price axis will paint over itself — last values first,
     * then the caller's price lines.
     *
     * @return {{y: number, text: string, background: string, textColor: (string|undefined), title: string}[]}
     */
    collectAxisBadges(pane, record) {
        const badges = [];
        const drawn = FULL_BUILD
            ? pane.series.filter((series) => series.scale === record)
            : pane.series;

        // Price lines first so the last value paints over them: when an alert
        // sits close to the current price, the live number is the one that has
        // to stay readable.
        for (const series of drawn) {
            for (const line of series.priceLines) {
                const { price, color, axisLabelVisible, axisLabelColor, axisLabelTextColor } = line.options;

                if (! axisLabelVisible || ! Number.isFinite(price)) {
                    continue;
                }

                const y = record.priceScale.priceToY(price);

                // A label clamped to the edge would claim the axis reaches a
                // price it does not; off-scale lines simply have no label.
                if (y < pane.plot.top || y > pane.plot.bottom) {
                    continue;
                }

                badges.push({
                    y,
                    text: this.formatPrice(price, record, series),
                    background: axisLabelColor || color || this.options.layout.textColor,
                    textColor: axisLabelTextColor || undefined,
                    title: '',
                });
            }
        }

        for (const series of drawn) {
            if (! series.options.visible || ! series.options.lastValueVisible) {
                continue;
            }

            const point = this.priceSourcePoint(series);

            if (! point) {
                continue;
            }

            badges.push({
                y: record.priceScale.priceToY(point.value),
                text: this.formatPrice(point.value, record, series),
                background: series.definition.lastValueColor(series.options, point),
                textColor: undefined,
                title: series.options.title,
            });
        }

        // A primitive's own labels last, so they paint over the series values.
        // A plugin that draws a level and cannot label the axis has told the
        // reader where the level is but not what it is worth, which is the
        // half of the answer they came for.
        for (const series of drawn) {
            collectPrimitiveBadges(series.primitives, record, pane, badges, this);
        }

        // Only against the pane's own scale. A pane-level primitive belongs to
        // no series and so to no particular scale, and adding it to every
        // record would print its label twice on a chart with a left axis.
        if (record === pane) {
            collectPrimitiveBadges(pane.primitives, record, pane, badges, this);
        }

        return badges;
    }

    /**
     * A named series carries its name on a tag butted against the inside edge
     * of the price axis, so it reads as one label with the last-value badge.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} pane
     * @param {string} title
     * @param {number} y
     * @param {string} background
     */
    drawSeriesTitleTag(ctx, pane, title, y, background) {
        if (! title) {
            return;
        }

        const height = this.options.layout.fontSize + 6;
        const top = Math.max(pane.plot.top, Math.min(pane.plot.bottom - height, y - height / 2));
        const width = ctx.measureText(title).width + LABEL_PADDING_X * 2;
        const left = Math.max(pane.plot.left, pane.plot.right - width);

        ctx.fillStyle = background;
        ctx.fillRect(left, top, pane.plot.right - left, height);
        ctx.fillStyle = contrastTextColor(background);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, left + LABEL_PADDING_X, top + height / 2);
    }

    /**
     * A price badge, pointed at the level it reports.
     *
     * A rectangle says "this number belongs to this axis". A rectangle with a
     * point on the plot-facing edge says "this number belongs to *that line*",
     * which is what the reader is actually asking when two badges sit close
     * together and one of them is the live price.
     *
     * The point tracks `y` rather than sitting at the badge's centre. A badge
     * near the top or bottom of the pane is nudged inside the plot so it stays
     * whole, and a centred point would then aim a few pixels away from the
     * level it names — visibly wrong exactly where the last price spends its
     * time on a chart that has been scrolled.
     */
    drawAxisBadge(ctx, pane, text, y, background, textColor, onLeft) {
        const height = this.options.layout.fontSize + 6;
        const top = Math.max(pane.plot.top, Math.min(pane.plot.bottom - height, y - height / 2));
        const left = onLeft ? 0 : this.plot.right + 1;
        const width = onLeft ? Math.max(0, this.plot.left - 1) : this.priceAxisWidth - 1;

        if (width <= 0) {
            return;
        }

        // Kept inside the badge so the shape stays convex: a point level with
        // a corner is a triangle with a tail, not a tag.
        const aim = Math.max(top + BADGE_NOTCH, Math.min(top + height - BADGE_NOTCH, y));
        const notch = Math.min(BADGE_NOTCH, width);
        const near = onLeft ? left + width : left;
        const far = onLeft ? left : left + width;
        const inner = onLeft ? near - notch : near + notch;

        // The far corners are rounded and the point is not: the eye reads the
        // tip as the thing doing the pointing, and a rounded tip points at
        // everything within a few pixels of itself.
        const radius = Math.min(BADGE_RADIUS, Math.max(0, (width - notch) / 2), height / 2);
        const bottom = top + height;
        const step = onLeft ? -radius : radius;

        ctx.fillStyle = background;
        ctx.beginPath();
        ctx.moveTo(near, aim);
        ctx.lineTo(inner, top);
        ctx.lineTo(far - step, top);
        ctx.quadraticCurveTo(far, top, far, top + radius);
        ctx.lineTo(far, bottom - radius);
        ctx.quadraticCurveTo(far, bottom, far - step, bottom);
        ctx.lineTo(inner, bottom);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = textColor ?? contrastTextColor(background);
        ctx.textAlign = onLeft ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            text,
            onLeft ? far + width - notch - LABEL_PADDING_X : inner + LABEL_PADDING_X - 1,
            top + height / 2,
        );
    }

    /**
     * Picks axis ticks highest-significance-first so year and month boundaries
     * win the available room, then fills the gaps with lesser ticks.
     *
     * Finer classes are dropped wholesale once their own bars sit closer than
     * `MIN_CLASS_SPACING`: a year of daily bars should read as months, not as
     * month names with stray day numbers wedged between them.
     *
     * @return {{x: number, label: string}[]}
     */
    buildTimeTicks(ctx) {
        if (! this.options.timeScale.visible || ! this.timeIndex.length) {
            return [];
        }

        const { from, to } = this.timeScale.visibleIndices();

        if (to < from) {
            return [];
        }

        const spanSeconds = this.timeIndex[to] - this.timeIndex[from];
        const locale = this.options.localization.locale;
        const allowIntraday = this.options.timeScale.timeVisible;
        const candidates = [];
        const perClassCount = new Map();

        ctx.font = this.font();

        // One candidate per pixel at most.
        //
        // This walked every visible bar, which is fine at a thousand and
        // ruinous at half a million: each one costs two Date objects to weigh
        // and a text measurement to size, so a chart of minute bars over a
        // decade spent tens of milliseconds a frame deciding where to put
        // forty labels. No two candidates a pixel apart can both be drawn, so
        // examining them was work that could never change the answer.
        const stride = Math.max(1, Math.round(1 / Math.max(this.timeScale.barSpacing, 1e-6)));

        // A series that never crosses midnight — the intraday tab — has no
        // tick above hour weight to offer. Dropping those would leave the axis
        // blank, so the time-of-day labels stand in.
        const weights = new Map();
        let previous = from > 0 ? this.timeIndex[from - stride] ?? this.timeIndex[from - 1] : null;

        for (let index = from; index <= to; index += stride) {
            // Weighed against the previous *sampled* bar rather than the
            // previous bar: at this zoom a boundary inside one stride cannot be
            // drawn separately anyway, so what matters is the coarsest
            // boundary the stride crossed.
            weights.set(index, tickWeight(this.timeIndex[index], previous));
            previous = this.timeIndex[index];
        }

        let hasDayBoundary = false;

        for (const [index, weight] of weights) {
            if (weight >= TickWeight.Day && index > from) {
                hasDayBoundary = true;

                break;
            }
        }

        const skipIntraday = ! allowIntraday && hasDayBoundary;

        for (let index = from; index <= to; index += stride) {
            const timestamp = this.timeIndex[index];
            const weight = weights.get(index);

            if (skipIntraday && weight < TickWeight.Day) {
                continue;
            }

            // A caller's formatter is asked first and may decline by returning
            // nothing, which is how "just the year, but leave the rest alone"
            // is expressed without reimplementing the whole ladder.
            const custom = this.options.timeScale.tickMarkFormatter?.(timestamp, weight, locale);
            const label = custom ?? formatTick(timestamp, weight, {
                locale,
                spanSeconds,
                dateFormat: this.options.localization.dateFormat,
            });

            perClassCount.set(weight, (perClassCount.get(weight) ?? 0) + 1);

            // Measured bold throughout: the lead ticks render bold, and the
            // wider measurement keeps the collision test on the safe side.
            ctx.font = `bold ${this.font()}`;

            candidates.push({
                x: this.timeScale.indexToX(index),
                width: ctx.measureText(label).width,
                weight,
                index,
                label,
            });
        }

        const plotWidth = this.plot.right - this.plot.left;
        let finestWeight = TickWeight.Year;

        for (const [weight, count] of perClassCount) {
            if (count > 0 && plotWidth / count >= MIN_CLASS_SPACING) {
                finestWeight = Math.min(finestWeight, weight);
            }
        }

        const accepted = [];

        candidates
            .filter((candidate) => candidate.weight >= finestWeight)
            .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
            .forEach((candidate) => {
                const half = candidate.width / 2;

                if (candidate.x - half < this.plot.left || candidate.x + half > this.plot.right) {
                    return;
                }

                const collides = accepted.some((tick) => (
                    Math.abs(tick.x - candidate.x) < (tick.width + candidate.width) / 2 + TICK_GAP
                ));

                if (! collides) {
                    accepted.push(candidate);
                }
            });

        return accepted.sort((a, b) => a.x - b.x);
    }

    drawTimeAxis(ctx, ticks) {
        if (! this.options.timeScale.visible) {
            return;
        }

        const tinting = this.tintingSeries(this.panes[0]);

        if (tinting) {
            const gradient = this.fillGradient(ctx, tinting);

            // The same gradient carried on downwards, so the strip is whatever
            // colour the fill had reached by the bottom of the plot rather
            // than a flat band with a seam along its top edge.
            //
            // The full width, not just the plot's. Stopping at the price axis
            // leaves the square where the two strips meet unpainted, and a
            // white notch in the corner is more noticeable than either strip —
            // it is the one right angle on the chart, so the eye goes to it.
            if (gradient) {
                ctx.save();
                ctx.fillStyle = gradient;
                ctx.fillRect(0, this.plot.bottom, this.width, this.height - this.plot.bottom);
                ctx.restore();
            }
        }

        const { borderVisible, borderColor } = this.options.timeScale;

        ctx.save();
        ctx.font = this.font();
        ctx.fillStyle = this.options.layout.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // The coarsest boundary on screen is the one that orients the reader,
        // so it carries the weight — the year among months, the hour among
        // minutes.
        const leadWeight = ticks.reduce((highest, tick) => Math.max(highest, tick.weight), 0);

        // The coarsest boundary on screen carries the weight, unless a caller
        // would rather it did not — a dense axis, or a typeface whose bold is
        // heavy enough to read as a different size.
        const bold = this.options.timeScale.allowBoldLabels !== false;

        for (const tick of ticks) {
            ctx.font = bold && tick.weight === leadWeight ? `bold ${this.font()}` : this.font();
            ctx.fillText(tick.label, tick.x, this.plot.bottom + 6);

            if (this.options.timeScale.ticksVisible) {
                ctx.fillRect(Math.round(tick.x), this.plot.bottom, 1, TICK_MARK);
            }
        }

        ctx.font = this.font();

        if (borderVisible && ! tinting) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.plot.left, Math.round(this.plot.bottom) + 0.5);
            ctx.lineTo(this.plot.right, Math.round(this.plot.bottom) + 0.5);
            ctx.stroke();
        }

        this.drawPrimitiveTimeLabels(ctx);

        ctx.restore();
    }

    /**
     * Labels a primitive wants on the time axis — the date a drawing starts
     * at, the moment an event fired.
     *
     * Painted over the tick labels, for the same reason the price axis paints
     * its badges over its ticks: a label half-covering a date is worse than
     * either of them alone.
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    drawPrimitiveTimeLabels(ctx) {
        const labels = [];

        for (const pane of this.panes) {
            collectTimeAxisLabels(pane.primitives, labels, this);

            for (const series of pane.series) {
                collectTimeAxisLabels(series.primitives, labels, this);
            }
        }

        if (! labels.length) {
            return;
        }

        const height = this.options.layout.fontSize + 8;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const label of labels) {
            const width = ctx.measureText(label.text).width + AXIS_PADDING;
            const left = Math.max(0, Math.min(this.plot.right - width, label.x - width / 2));

            ctx.fillStyle = label.background;
            ctx.fillRect(left, this.plot.bottom + 1, width, height);
            ctx.fillStyle = label.textColor || contrastTextColor(label.background);
            ctx.fillText(label.text, left + width / 2, this.plot.bottom + 1 + height / 2);
        }
    }

    /* ------------------------------------------------------------ crosshair */

    /**
     * Which way text runs, from the locale.
     *
     * Canvas reorders a run of Arabic on its own, but it places the run
     * according to `direction` — so a label mixing a month name with a number
     * comes out with the parts in the right order and the whole thing anchored
     * to the wrong end. Set once per frame, on both canvases.
     *
     * The plot is never mirrored. Time runs left to right in every locale, and
     * a reversed axis would put the newest bar where a reader of any language
     * looks for the oldest — the direction of a time series is not a property
     * of the language describing it.
     */
    textDirection() {
        return isRightToLeft(this.options.localization.locale) ? 'rtl' : 'ltr';
    }

    /** Lets go of whichever series had the pointer, and repaints if one did. */
    releaseFocus() {
        if (! this.focusedSeries) {
            return;
        }

        this.focusedSeries = null;
        this.scheduleRender();
    }

    drawCrosshair() {
        const ctx = this.overlayCtx;

        ctx.clearRect(0, 0, this.width, this.height);

        const { mode, vertLine, horzLine } = this.options.crosshair;

        if (! this.crosshair || mode === CrosshairMode.Hidden) {
            return;
        }

        const { index, y, pane } = this.crosshair;
        const x = this.timeScale.indexToX(index);

        ctx.save();
        ctx.font = this.font();
        ctx.direction = this.textDirection();

        // The vertical line runs the whole height — the same bar is under the
        // cursor in every pane. The horizontal one is a price, which only means
        // something on the scale it was read from, so it stays in its pane.
        if (vertLine.visible) {
            drawCrosshairLine(
                ctx,
                vertLine,
                Math.round(x) + 0.5, this.plot.top,
                Math.round(x) + 0.5, this.plot.bottom,
            );
        }

        if (horzLine.visible) {
            drawCrosshairLine(
                ctx,
                horzLine,
                pane.plot.left, Math.round(y) + 0.5,
                pane.plot.right, Math.round(y) + 0.5,
            );
        }

        ctx.setLineDash([]);
        this.drawCrosshairMarkers(ctx, pane, index);

        if (horzLine.visible && horzLine.labelVisible && this.options.rightPriceScale.visible) {
            this.drawAxisBadge(
                ctx,
                pane,
                this.formatPrice(pane.priceScale.yToPrice(y), pane),
                y,
                horzLine.labelBackgroundColor,
            );
        }

        // The same height is a different price on each scale, so a chart with
        // two axes needs the reading twice — one label would be right for half
        // the series and quietly wrong for the rest.
        if (FULL_BUILD && horzLine.visible && horzLine.labelVisible) {
            const left = leftScale(pane);

            if (left && left.options.visible) {
                this.drawAxisBadge(
                    ctx,
                    pane,
                    this.formatPrice(left.priceScale.yToPrice(y), left),
                    y,
                    horzLine.labelBackgroundColor,
                    undefined,
                    true,
                );
            }
        }

        if (vertLine.visible && vertLine.labelVisible && this.options.timeScale.visible) {
            this.drawTimeBadge(ctx, x, this.timeIndex[index]);
        }

        ctx.restore();
    }

    drawCrosshairMarkers(ctx, pane, index) {
        for (const series of pane.series) {
            if (! series.options.visible || ! series.options.crosshairMarkerVisible) {
                continue;
            }

            if (series.definition.isBarLike) {
                continue;
            }

            const point = series.byIndex[index];

            if (! point || point.value === null || point.value === undefined) {
                continue;
            }

            const colour = series.definition.lastValueColor(series.options, point);

            ctx.beginPath();
            ctx.arc(
                this.timeScale.indexToX(index),
                pane.priceScale.priceToY(point.value),
                series.options.crosshairMarkerRadius,
                0,
                Math.PI * 2,
            );
            ctx.fillStyle = series.options.crosshairMarkerBackgroundColor || colour;
            ctx.fill();
            ctx.lineWidth = series.options.crosshairMarkerBorderWidth;
            ctx.strokeStyle = series.options.crosshairMarkerBorderColor
                || this.options.layout.background.color;
            ctx.stroke();
        }
    }

    drawTimeBadge(ctx, x, timestamp) {
        if (timestamp === undefined) {
            return;
        }

        const intraday = this.options.timeScale.timeVisible;
        const formatter = this.options.localization.timeFormatter;

        // Declared in the options since the first commit and never read until
        // now: a caller setting it got silence, which is worse than not
        // offering it at all.
        const label = typeof formatter === 'function'
            ? formatter(timestamp)
            : formatCrosshairTime(timestamp, {
                locale: this.options.localization.locale,
                intraday,
            });
        const width = ctx.measureText(label).width + AXIS_PADDING;
        const height = this.options.layout.fontSize + 8;
        const left = Math.max(0, Math.min(this.plot.right - width, x - width / 2));
        const background = this.options.crosshair.vertLine.labelBackgroundColor;

        const top = this.plot.bottom + 1;

        // Rounded to match the price badge, and pointed at the bar for the same
        // reason: the label is about one column, and a rectangle centred under
        // a line still has to be read against the line to know which.
        //
        // The point is on the top edge because that is the edge facing the
        // plot, and it tracks `x` rather than the label's centre — a label
        // near either end is slid inward to stay whole, and a centred point
        // would then indicate the wrong bar.
        const notch = BADGE_NOTCH;
        const radius = Math.min(BADGE_RADIUS, width / 2, height / 2);
        const shoulder = top + notch;
        const bottom = shoulder + height;
        const right = left + width;

        // The point sits within the shoulders, so a label slid inward keeps a
        // convex shape rather than growing a tail off one corner.
        const aim = Math.max(left + notch + radius, Math.min(right - notch - radius, x));

        ctx.fillStyle = background;
        ctx.beginPath();
        ctx.moveTo(aim, top);
        ctx.lineTo(aim + notch, shoulder);
        ctx.lineTo(right - radius, shoulder);
        ctx.quadraticCurveTo(right, shoulder, right, shoulder + radius);
        ctx.lineTo(right, bottom - radius);
        ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
        ctx.lineTo(left + radius, bottom);
        ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
        ctx.lineTo(left, shoulder + radius);
        ctx.quadraticCurveTo(left, shoulder, left + radius, shoulder);
        ctx.lineTo(aim - notch, shoulder);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = contrastTextColor(background);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, left + width / 2, shoulder + height / 2);
    }

    /* --------------------------------------------------------------- events */

    bindEvents() {
        // Full build only, on the same reasoning as panes and custom series:
        // structural, and a sparkline in a table cell has no use for it.
        if (FULL_BUILD && this.options.handleKeyboard) {
            this.keyboard = attachKeyboard(this);
        }

        this.onPointerMove = (event) => this.handlePointerMove(event);
        this.onPointerLeave = () => this.handlePointerLeave();
        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerUp = (event) => this.handlePointerUp(event);
        this.onDragMove = (event) => this.handleDragMove(event);
        this.onDoubleClick = (event) => this.handleDoubleClick(event);
        this.onWheel = (event) => this.handleWheel(event);
        this.onTouchStart = (event) => this.handleTouchStart(event);
        this.onTouchMove = (event) => this.handleTouchMove(event);
        this.onTouchEnd = () => this.handleTouchEnd();

        this.element.addEventListener('mousemove', this.onPointerMove);
        this.element.addEventListener('mouseleave', this.onPointerLeave);
        this.element.addEventListener('mousedown', this.onPointerDown);
        this.element.addEventListener('dblclick', this.onDoubleClick);

        // Drags are tracked on the window so a gesture that runs off the axis —
        // or off the chart entirely — keeps scaling until the button is let go.
        window.addEventListener('mousemove', this.onDragMove);
        window.addEventListener('mouseup', this.onPointerUp);

        this.element.addEventListener('wheel', this.onWheel, { passive: false });
        this.element.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.element.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.element.addEventListener('touchend', this.onTouchEnd, { passive: true });
    }

    /**
     * @param {{x: number, y: number}} point
     * @return {'price'|'time'|'separator'|'plot'}
     */
    regionAt(point) {
        if (this.options.timeScale.visible && point.y > this.plot.bottom) {
            return 'time';
        }

        // A separator wins over the price axis: it spans the full width, and
        // the few pixels where they meet are far more likely to be a grab at
        // the divider than a precise attempt to scale one pane's prices.
        if (FULL_BUILD && this.panes.length > 1 && this.options.layout.panes.enableResize
            && separatorAt(this, point.y) >= 0) {
            return 'separator';
        }

        if (this.options.rightPriceScale.visible && point.x > this.plot.right) {
            return 'price';
        }

        if (FULL_BUILD && point.x < this.plot.left) {
            return 'price';
        }

        return 'plot';
    }

    /**
     * The scale whose axis sits under `x`, or the pane's own when the pointer
     * is not in the left gutter.
     *
     * @param {Object} pane
     * @param {number} x
     * @return {Object}
     */
    scaleAtX(pane, x) {
        return FULL_BUILD && x < this.plot.left ? (leftScale(pane) ?? pane) : pane;
    }

    /**
     * @param {number} y
     * @return {Object}
     */
    paneAt(y) {
        return FULL_BUILD && this.panes.length > 1 ? paneAtY(this, y) : this.panes[0];
    }

    localPoint(event) {
        const rect = this.element.getBoundingClientRect();

        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    indexAt(x) {
        if (! this.timeIndex.length) {
            return -1;
        }

        const logical = this.timeScale.xToIndex(x);

        return Math.max(0, Math.min(this.timeIndex.length - 1, Math.round(logical)));
    }

    handlePointerMove(event) {
        if (this.pointer.mode === 'price' || this.pointer.mode === 'time' || this.pointer.mode === 'separator') {
            return;
        }

        const point = this.localPoint(event);

        this.hovered = this.primitiveAt(point);
        this.applyCursor(point);
        this.trackSeparatorHover(point);
        this.updateCrosshair(point, event);
    }

    /**
     * Separators light up under the pointer, so it is discoverable that they
     * can be dragged at all.
     *
     * @param {{x: number, y: number}} point
     */
    trackSeparatorHover(point) {
        // Written as a positive condition rather than an early return: a
        // folded `if (false)` block is deleted outright, where code after a
        // guaranteed return may not be.
        if (FULL_BUILD && this.panes.length > 1) {
            const hovered = this.options.layout.panes.enableResize ? separatorAt(this, point.y) : -1;

            if (hovered !== this.hoveredSeparator) {
                this.hoveredSeparator = hovered;
                this.scheduleRender();
            }
        }
    }

    /**
     * What a primitive claims sits under the pointer, across every pane and
     * every series.
     *
     * @param {{x: number, y: number}} point
     * @return {Object|null}
     */
    primitiveAt(point) {
        let winner = null;

        for (const pane of this.panes) {
            winner = hitTestPrimitives(pane.primitives, point.x, point.y, winner, this);

            for (const series of pane.series) {
                winner = hitTestPrimitives(series.primitives, point.x, point.y, winner, this);
            }
        }

        return winner;
    }

    applyCursor(point) {
        const region = this.pointer.mode ?? this.regionAt(point);

        if (region === 'price' && this.axisDragEnabled('price')) {
            this.element.style.cursor = 'ns-resize';

            return;
        }

        if (region === 'time' && this.axisDragEnabled('time')) {
            this.element.style.cursor = 'ew-resize';

            return;
        }

        if (FULL_BUILD && region === 'separator') {
            this.element.style.cursor = 'row-resize';

            return;
        }

        // A drawing that can be grabbed has to say so under the pointer, or it
        // is not discoverable that it can be grabbed at all. Asked after the
        // chart's own regions so a primitive lying over an axis cannot take
        // the cursor away from a drag that is already the axis's job.
        this.element.style.cursor = this.hovered?.cursorStyle ?? '';
    }

    /**
     * `handleScale.axisPressedMouseMove` is either a flag for both axes or an
     * object naming them, matching what callers already pass.
     *
     * @param {'price'|'time'} axis
     * @return {boolean}
     */
    axisDragEnabled(axis) {
        const option = this.options.handleScale.axisPressedMouseMove;

        return typeof option === 'object' && option !== null
            ? option[axis] !== false
            : Boolean(option);
    }

    handleDragMove(event) {
        if (! this.pointer.mode) {
            return;
        }

        const point = this.localPoint(event);

        if (this.pointer.mode === 'price') {
            if (this.axisDragEnabled('price')) {
                this.scalePriceAxis(point.y);
                this.pointer.moved = true;
            }

            return;
        }

        if (this.pointer.mode === 'time') {
            if (this.axisDragEnabled('time')) {
                this.scaleTimeAxis(point.x);
                this.pointer.moved = true;
            }

            return;
        }

        if (FULL_BUILD && this.pointer.mode === 'separator') {
            resizePanes(this, this.pointer.separator, point.y, this.pointer.snapshot);
            this.pointer.moved = true;
            this.scheduleRender();

            return;
        }

        if (this.options.handleScroll.pressedMouseMove) {
            this.scrollBy(point.x - this.pointer.lastX);
            this.pointer.lastX = point.x;
            this.pointer.moved = true;
        }
    }

    /**
     * Stretches or compresses the price range about its centre as the axis is
     * dragged. Distances are measured from a pivot below the plot rather than
     * from the plot itself, so the gesture accelerates the further down the
     * axis it is pulled — dragging down compresses, dragging up expands.
     *
     * @param {number} y
     */
    scalePriceAxis(y) {
        const pane = this.pointer.pane;
        const record = this.pointer.scale ?? pane;
        const plot = pane.plot;
        const height = plot.bottom - plot.top;

        if (height <= 1 || ! this.pointer.snapshot) {
            return;
        }

        const pivot = plot.top + height * (1 + record.options.scaleMargins.top);
        const distance = (value) => pivot - Math.max(plot.top, Math.min(plot.bottom, value));
        const from = distance(this.pointer.startY);
        const to = distance(y);

        if (from <= 0 || to <= 0) {
            return;
        }

        const factor = Math.min(50, Math.max(0.02, from / to));
        const { min, max } = this.pointer.snapshot;
        const centre = (min + max) / 2;
        const half = ((max - min) * factor) / 2;

        record.autoScale = false;
        record.manualRange = { min: centre - half, max: centre + half };
        this.scheduleRender();
    }

    /**
     * Widens or narrows bar spacing against the right edge of the plot.
     *
     * @param {number} x
     */
    scaleTimeAxis(x) {
        const width = this.timeScale.width;

        if (width <= 1 || ! this.pointer.snapshot) {
            return;
        }

        const clamp = (value) => Math.max(0, Math.min(width, width - value));
        const current = clamp(x);
        const start = clamp(this.pointer.startX);

        if (current === 0 || start === 0) {
            return;
        }

        this.autoFit = false;
        this.timeScale.setBarSpacing(this.pointer.snapshot.barSpacing * (current / start));
        this.scheduleRender();
    }

    /**
     * Double-clicking an axis hands it back to automatic scaling.
     *
     * @param {MouseEvent} event
     */
    handleDoubleClick(event) {
        const point = this.localPoint(event);
        const region = this.regionAt(point);

        if (region === 'plot' && this.dblClickHandlers.size) {
            const index = this.indexAt(point.x);
            const item = this.allSeries.map((series) => series.byIndex[index]).find(Boolean);
            const hit = this.primitiveAt(point);

            for (const handler of this.dblClickHandlers) {
                handler({
                    time: item ? item.time : undefined,
                    logical: index,
                    point,
                    hoveredObjectId: hit?.externalId,
                    sourceEvent: event,
                });
            }
        }

        // A double click on an axis puts it back to automatic. Refusable,
        // because on a chart whose scale a caller drives themselves, having it
        // silently taken back by a stray double click is a bug they cannot see
        // the cause of.
        if (! this.axisResetEnabled()) {
            return;
        }

        if (region === 'price') {
            const record = this.scaleAtX(this.paneAt(point.y), point.x);

            record.autoScale = true;
            record.manualRange = null;
            this.scheduleRender();

            return;
        }

        if (region === 'time') {
            this.autoFit = true;
            this.scheduleRender();
        }
    }

    /**
     * `handleScale.axisDoubleClickReset` is either a flag for both axes or an
     * object naming them, the same shape `axisPressedMouseMove` takes.
     *
     * @return {boolean}
     */
    axisResetEnabled() {
        const option = this.options.handleScale.axisDoubleClickReset;

        return typeof option === 'object' && option !== null
            ? option.price !== false || option.time !== false
            : option !== false;
    }

    updateCrosshair(point, event) {
        if (point.x < this.plot.left || point.x > this.plot.right
            || point.y < this.plot.top || point.y > this.plot.bottom) {
            this.handlePointerLeave();

            return;
        }

        const index = this.indexAt(point.x);

        if (index < 0) {
            return;
        }

        const pane = this.paneAt(point.y);
        const snapped = magnetY(
            pane,
            index,
            point.y,
            this.options.crosshair.mode,
            this.options.crosshair.doNotSnapToHiddenSeriesIndices,
        );
        const y = snapped === null ? point.y : snapped;

        const focus = this.options.crosshair.dimOtherSeries
            ? seriesUnderPointer(pane, index, point.y, FOCUS_REACH)
            : null;

        this.crosshair = { index, y, x: point.x, pane };

        // The data canvas only repaints when the focus actually changes — the
        // crosshair moves on every pointer event and redrawing the series with
        // it would undo the reason there are two canvases.
        if (focus !== this.focusedSeries) {
            this.focusedSeries = focus;
            this.scheduleRender();
        }

        this.drawCrosshair();
        this.emitCrosshair(index, point, event);
    }

    /**
     * Places the crosshair from a price and a time rather than from a pointer.
     *
     * The price is read through the given series' own scale, not the pane's
     * first one: on a chart with an overlay on a second scale, taking the
     * pane's would put the crosshair at the right number on the wrong axis.
     *
     * @param {number} price
     * @param {*} horizontalPosition a time
     * @param {Object} seriesApi
     */
    setCrosshair(price, horizontalPosition, seriesApi) {
        const timestamp = toTimestamp(horizontalPosition);

        if (timestamp === null || ! this.timeIndex.length || ! Number.isFinite(price)) {
            return;
        }

        this.ensureLayout();

        const index = nearestIndex(this.timeIndex, timestamp);
        const series = seriesApi?._internal;
        const scale = series?.scale ?? this.panes[0];
        const pane = series?.pane ?? this.panes[0];

        this.crosshair = {
            index,
            y: scale.priceScale.priceToY(price),
            x: this.timeScale.indexToX(index),
            pane,
            scale,
        };

        this.drawCrosshair();
    }

    clearCrosshair() {
        this.releaseFocus();

        if (! this.crosshair) {
            return;
        }

        this.crosshair = null;
        this.drawCrosshair();
    }

    handlePointerLeave() {
        // Released before the early return, not after it. The focus and the
        // crosshair are separate state with separate lifetimes, and clearing
        // one inside a guard on the other leaves a chart dimmed with nothing on
        // it to explain why — until something unrelated forces a repaint.
        this.releaseFocus();

        if (! this.crosshair) {
            return;
        }

        this.crosshair = null;
        this.hovered = null;
        this.drawCrosshair();

        for (const handler of this.crosshairHandlers) {
            handler({ time: undefined, point: undefined, logical: undefined, seriesData: new Map() });
        }
    }

    emitCrosshair(index, point, event) {
        if (! this.crosshairHandlers.size) {
            return;
        }

        const param = this.crosshairParam(index, point, event);

        for (const handler of this.crosshairHandlers) {
            handler(param);
        }
    }

    /**
     * What is under the pointer, as a question rather than as an event.
     *
     * `subscribeCrosshairMove` is the right shape for a tooltip, which has to
     * react. It is the wrong shape for anything that arrives later and needs to
     * know where the reader is pointing — an agent asked "what is this candle?"
     * cannot subscribe retroactively, and keeping a copy of the last event in
     * a variable is what every caller would otherwise write.
     *
     * Null when the pointer is not over the chart, which is a real answer and
     * not a failure.
     *
     * @returns {Object|null}
     */
    crosshairState() {
        if (! this.crosshair) {
            return null;
        }

        const { index, x, y, pane, scale } = this.crosshair;
        const param = this.crosshairParam(index, { x, y });

        // The scale the y was measured on. They differ only when the crosshair
        // was placed programmatically against a series on an overlay scale;
        // taking the pane's would report the right number off the wrong axis.
        param.price = (scale ?? pane).priceScale.yToPrice(y);

        return param;
    }

    crosshairParam(index, point, event) {
        const all = this.allSeries;
        const seriesData = new Map();
        let hoveredSeries;

        for (const series of all) {
            const item = series.byIndex[index];

            if (item) {
                seriesData.set(series.api, item.raw);
                hoveredSeries = hoveredSeries ?? series.api;
            }
        }

        const anyPoint = all.map((series) => series.byIndex[index]).find(Boolean);
        const param = {
            time: anyPoint ? anyPoint.time : undefined,
            logical: index,
            point: { x: point.x, y: point.y },
            seriesData,
            hoveredSeries,

            // The id the primitive gave for whatever is under the pointer.
            // Without it a subscriber knows a click happened somewhere on the
            // chart but not which of its own drawings it landed on, which is
            // the difference between a chart you can annotate and one you can
            // only look at.
            hoveredObjectId: this.hovered?.externalId,
            sourceEvent: event,
        };

        return param;
    }

    scrollBy(deltaPixels) {
        this.autoFit = false;
        this.timeScale.scrollBy(deltaPixels);
        this.scheduleRender();
    }

    handlePointerDown(event) {
        const point = this.localPoint(event);
        const region = this.regionAt(point);
        const pane = this.paneAt(point.y);

        this.pointer.mode = region;
        this.pointer.pane = pane;
        this.pointer.scale = this.scaleAtX(pane, point.x);
        this.pointer.moved = false;
        this.pointer.lastX = point.x;
        this.pointer.startX = point.x;
        this.pointer.startY = point.y;

        if (region === 'price') {
            this.pointer.snapshot = { min: this.pointer.scale.priceScale.min, max: this.pointer.scale.priceScale.max };
        } else if (region === 'time') {
            this.pointer.snapshot = { barSpacing: this.timeScale.barSpacing };
        } else if (FULL_BUILD && region === 'separator') {
            this.pointer.separator = separatorAt(this, point.y);
            this.pointer.snapshot = resizeSnapshot(this, this.pointer.separator, point.y);
        } else {
            this.pointer.snapshot = null;
        }

        if (region !== 'plot') {
            event.preventDefault();
        }
    }

    handlePointerUp(event) {
        if (this.pointer.mode === 'plot' && ! this.pointer.moved && this.clickHandlers.size) {
            const point = this.localPoint(event);
            const index = this.indexAt(point.x);
            const item = this.allSeries.map((series) => series.byIndex[index]).find(Boolean);

            // Tested here rather than reused from the hover: a tap on a touch
            // screen produces no move beforehand, so there is nothing hovered
            // to reuse and a drawing would only ever be selectable with a
            // mouse.
            const hit = this.primitiveAt(point);

            for (const handler of this.clickHandlers) {
                handler({
                    time: item ? item.time : undefined,
                    logical: index,
                    point,
                    hoveredObjectId: hit?.externalId,
                    sourceEvent: event,
                });
            }
        }

        this.pointer.mode = null;
        this.pointer.snapshot = null;
    }

    /**
     * A wheel notch and a trackpad flick differ by an order of magnitude in
     * delta, so the zoom step is taken from the delta rather than applied flat
     * per event — a flat step races away on a trackpad, which fires dozens of
     * small events per gesture. One full notch moves bar spacing by a tenth.
     *
     * @param {WheelEvent} event
     */
    handleWheel(event) {
        const { handleScale, handleScroll } = this.options;

        if (handleScale.mouseWheel) {
            const step = wheelZoomStep(event);

            if (step === 0) {
                return;
            }

            event.preventDefault();
            this.autoFit = false;

            // Anchored at the pointer by default, which is what makes a wheel
            // zoom feel like leaning in: the bar you are looking at stays under
            // the cursor. Anchoring at the right edge instead keeps the newest
            // bar in place, which is what a live chart wants — you are watching
            // the edge, not the middle.
            this.timeScale.zoomAt(
                this.options.timeScale.rightBarStaysOnScroll ? this.plot.right : this.localPoint(event).x,
                1 + step / 10,
            );
            this.scheduleRender();

            return;
        }

        if (handleScroll.mouseWheel) {
            event.preventDefault();
            this.scrollBy(-event.deltaX || -event.deltaY);
        }
    }

    handleTouchStart(event) {
        if (FULL_BUILD) {
            this.cancelKinetic?.();
            this.cancelKinetic = null;
        }

        if (event.touches.length === 1) {
            const touch = event.touches[0];

            this.pointer.lastX = touch.clientX;
            this.pointer.pinchDistance = 0;
            this.pointer.touchSpeed = 0;
            this.pointer.touch = { clientX: touch.clientX, clientY: touch.clientY };

            if (this.options.trackingMode) {
                this.longPress.start({ x: touch.clientX, y: touch.clientY });
            }

            return;
        }

        // A second finger is a pinch, which is not a hold and not a reading.
        this.endTracking();

        if (event.touches.length === 2) {
            this.pointer.pinchDistance = Math.hypot(
                event.touches[0].clientX - event.touches[1].clientX,
                event.touches[0].clientY - event.touches[1].clientY,
            );
        }
    }

    handleTouchMove(event) {
        const { handleScroll, handleScale } = this.options;

        if (event.touches.length === 2 && handleScale.pinch) {
            const distance = Math.hypot(
                event.touches[0].clientX - event.touches[1].clientX,
                event.touches[0].clientY - event.touches[1].clientY,
            );

            if (this.pointer.pinchDistance > 0) {
                const rect = this.element.getBoundingClientRect();
                const focal = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;

                event.preventDefault();
                this.autoFit = false;
                this.timeScale.zoomAt(focal, distance / this.pointer.pinchDistance);
                this.scheduleRender();
            }

            this.pointer.pinchDistance = distance;

            return;
        }

        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const x = touch.clientX;

            this.pointer.touch = { clientX: touch.clientX, clientY: touch.clientY };

            // Once the finger is tracking it belongs to the crosshair, and the
            // chart holds still underneath it. Scrolling as well would mean
            // the bar being read slides out from under the reading.
            if (this.pointer.tracking) {
                event.preventDefault();
                this.trackTouch(touch);

                return;
            }

            this.longPress.move({ x: touch.clientX, y: touch.clientY });

            if (handleScroll.horzTouchDrag) {
                const delta = x - this.pointer.lastX;

                event.preventDefault();
                this.scrollBy(delta);
                this.pointer.lastX = x;
                this.pointer.touchSpeed = delta;
            }
        }
    }

    /**
     * Enters tracking, once the finger has proved it is holding rather than
     * scrolling. Anything the flick was going to do is abandoned.
     */
    beginTracking() {
        this.pointer.tracking = true;
        this.pointer.touchSpeed = 0;

        if (this.pointer.touch) {
            this.trackTouch(this.pointer.touch);
        }
    }

    endTracking() {
        this.longPress.cancel();

        if (! this.pointer.tracking) {
            return;
        }

        this.pointer.tracking = false;

        if (this.options.trackingMode?.exitMode === 'onTouchEnd') {
            this.handlePointerLeave();
        }
    }

    /**
     * Shows the crosshair for a touch, above the finger rather than under it.
     *
     * @param {Touch} touch
     */
    trackTouch(touch) {
        this.updateCrosshair(trackingPoint(touch, this.element.getBoundingClientRect()));
    }

    handleTouchEnd() {
        this.pointer.pinchDistance = 0;

        const wasTracking = this.pointer.tracking;

        this.endTracking();

        if (FULL_BUILD) {
            // A flick that ended in a reading is not a flick. Carrying the
            // chart on after the finger lifts would slide the bar out from
            // under the price the reader just stopped to look at.
            // Momentum is movement the reader did not ask for at the moment it
            // happens — the finger has already left the glass.
            if (! wasTracking && this.options.kineticScroll?.touch
                && ! prefersReducedMotion() && Math.abs(this.pointer.touchSpeed) > 1) {
                this.cancelKinetic = startKineticScroll(this, this.pointer.touchSpeed);
            }
        }
    }

    /* ----------------------------------------------------------------- api */

    get priceScaleApi() {
        return this.priceScaleApiFor(this.panes[0]);
    }

    /**
     * @param {Object} record a scale record, which for the right-hand scale is
     *     the pane itself
     * @return {Object}
     */
    priceScaleApiFor(record) {
        return {
            applyOptions: (options) => {
                mergeOptions(record.options, options ?? {});

                if (options && options.autoScale) {
                    record.autoScale = true;
                    record.manualRange = null;
                }

                this.scheduleRender();
            },
            options: () => record.options,
            width: () => (record.id === LEFT_SCALE ? this.leftAxisWidth : this.priceAxisWidth),
            setAutoScale: (enabled) => {
                record.autoScale = enabled;

                if (enabled) {
                    record.manualRange = null;
                }

                this.scheduleRender();
            },
        };
    }


    get timeScaleApi() {
        return {
            fitContent: () => {
                this.autoFit = true;
                this.scheduleRender();
            },

            /**
             * Puts a span of logical indices on screen.
             *
             * Every viewport method funnels through here, and each one turns
             * off auto-fitting first: a caller naming a range and then having
             * the chart refit itself on the next frame would be watching the
             * chart argue with them.
             */
            setVisibleLogicalRange: (range) => {
                if (! range) {
                    return;
                }

                this.ensureLayout();
                this.autoFit = false;
                this.timeScale.setLogicalRange(range.from, range.to);
                this.scheduleRender();
            },

            /**
             * The same, named in times rather than indices.
             *
             * A time that falls on no bar takes the nearest one, because the
             * scale is indexed by bar: a Saturday is not a position on this
             * axis, and refusing the call would make every weekend a special
             * case for the caller instead of for us.
             */
            setVisibleRange: (range) => {
                if (! range || ! this.timeIndex.length) {
                    return;
                }

                const from = toTimestamp(range.from);
                const to = toTimestamp(range.to);

                if (from === null || to === null) {
                    return;
                }

                this.ensureLayout();
                this.autoFit = false;
                this.timeScale.setLogicalRange(
                    nearestIndex(this.timeIndex, from),
                    nearestIndex(this.timeIndex, to),
                );
                this.scheduleRender();
            },

            /** Bars of whitespace between the last bar and the right edge. */
            scrollPosition: () => {
                this.ensureLayout();

                return this.timeScale.rightOffset;
            },

            scrollToPosition: (position, animated) => {
                this.ensureLayout();
                this.autoFit = false;
                this.timeScale.rightOffset = position;
                this.timeScale.clampToEdges();
                this.scheduleRender();

                // `animated` is accepted and ignored, deliberately: a caller
                // porting code should not have to delete an argument, and a
                // jump is a truthful answer to a request to be somewhere.
                void animated;
            },

            /**
             * Back to the framing the chart was configured with.
             *
             * The configured one, not a fit: `barSpacing` and `rightOffset` as
             * the caller set them, or the defaults if they set nothing. That is
             * a different answer from `fitContent`, which squeezes every bar on
             * screen however many there are — and on a chart with ten years of
             * daily data those two look nothing alike. Doing a fit here would
             * make this method a second name for that one.
             */
            resetTimeScale: () => {
                this.ensureLayout();
                this.autoFit = false;
                this.timeScale.setBarSpacing(this.options.timeScale.barSpacing);
                this.timeScale.rightOffset = this.options.timeScale.rightOffset;
                this.timeScale.clampToEdges();
                this.scheduleRender();
            },

            coordinateToLogical: (x) => {
                this.ensureLayout();

                return this.timeIndex.length ? this.timeScale.xToIndex(x) : null;
            },

            logicalToCoordinate: (logical) => {
                this.ensureLayout();

                return this.timeIndex.length ? this.timeScale.indexToX(logical) : null;
            },

            /**
             * The index a time sits at, or null.
             *
             * `findNearest` is the difference between "where is this bar" and
             * "where would this moment go", and a caller placing a drawing at
             * an arbitrary timestamp wants the second.
             */
            timeToIndex: (time, findNearest) => {
                const timestamp = toTimestamp(time);

                if (timestamp === null || ! this.timeIndex.length) {
                    return null;
                }

                const index = nearestIndex(this.timeIndex, timestamp);

                return findNearest || this.timeIndex[index] === timestamp ? index : null;
            },

            height: () => Math.max(0, this.height - this.plot.bottom),

            subscribeSizeChange: (handler) => this.sizeHandlers.add(handler),
            unsubscribeSizeChange: (handler) => this.sizeHandlers.delete(handler),
            applyOptions: (options) => {
                mergeOptions(this.options.timeScale, options ?? {});
                this.timeScale.options = this.options.timeScale;

                // `rightOffset` and `barSpacing` are live state, not only
                // configuration: the scale copied them once when it was built,
                // so merging them into the options object changes nothing and
                // says nothing about it. Setting either is also an instruction
                // to stop refitting, and any fit still owed is applied first so
                // the explicit value lands on a measured scale rather than on
                // the defaults.
                if (options && options.rightOffset !== undefined) {
                    this.ensureLayout();
                    this.autoFit = false;
                    this.timeScale.rightOffset = options.rightOffset;
                }

                if (options && options.barSpacing !== undefined) {
                    this.ensureLayout();
                    this.autoFit = false;
                    this.timeScale.setBarSpacing(options.barSpacing);
                }

                this.scheduleRender();
            },
            options: () => this.options.timeScale,
            scrollToRealTime: () => {
                this.ensureLayout();

                const spacing = this.timeScale.barSpacing;

                this.timeScale.rightOffset = spacing > 0
                    ? this.timeScale.edgePadding() / spacing
                    : this.timeScale.padBars;

                this.scheduleRender();
            },
            getVisibleRange: () => {
                this.ensureLayout();

                const { from, to } = this.timeScale.visibleIndices();

                if (to < from) {
                    return null;
                }

                return { from: this.timeIndex[from], to: this.timeIndex[to] };
            },
            getVisibleLogicalRange: () => {
                this.ensureLayout();

                return this.timeIndex.length ? this.timeScale.logicalRange() : null;
            },
            timeToCoordinate: (time) => {
                this.ensureLayout();

                const timestamp = toTimestamp(time);

                if (timestamp === null || ! this.timeIndex.length) {
                    return null;
                }

                return this.timeScale.indexToX(nearestIndex(this.timeIndex, timestamp));
            },
            coordinateToTime: (x) => {
                this.ensureLayout();

                const index = this.indexAt(x);

                return index < 0 ? null : this.timeIndex[index];
            },
            width: () => this.timeScale.width,
            subscribeVisibleLogicalRangeChange: (handler) => this.logicalRangeHandlers.add(handler),
            unsubscribeVisibleLogicalRangeChange: (handler) => this.logicalRangeHandlers.delete(handler),
            subscribeVisibleTimeRangeChange: (handler) => this.timeRangeHandlers.add(handler),
            unsubscribeVisibleTimeRangeChange: (handler) => this.timeRangeHandlers.delete(handler),
        };
    }

    /**
     * A narrower chart shows fewer bars by default: the bars keep their width
     * and the viewport loses some off the left.
     *
     * `lockVisibleTimeRangeOnResize` reverses that — the same span of time
     * stays on screen and the bars get thinner to fit. A dashboard reflowing
     * its panels wants the second: a chart that silently changed which month
     * it was showing because a sidebar opened is a chart that lied.
     */
    resize(width, height) {
        const framing = this.options.timeScale.lockVisibleTimeRangeOnResize
            ? this.timeScale.logicalRange()
            : null;

        this.applySize(width, height);

        if (framing) {
            this.ensureLayout();
            this.timeScale.setLogicalRange(framing.from, framing.to);
        }

        this.scheduleRender();
    }

    applyOptions(options) {
        // The palette first, so anything alongside it in the same call still
        // wins — `applyOptions({ theme: 'dark', grid: { … } })` is one
        // statement and should behave like one.
        if (options?.theme) {
            this.applyTheme(options.theme);
        }

        mergeOptions(this.options, options ?? {});
        this.timeScale.options = this.options.timeScale;
        this.updateAttribution();

        if (options && (options.width || options.height)) {
            this.applySize(options.width ?? this.width, options.height ?? this.height);
        }

        // Both directions. Only starting it meant `autoSize` could be switched
        // on and never off: the observer went on resizing the chart back to
        // its container, so a later `width`/`height` was applied and then
        // undone on the next frame, and the option read as broken rather than
        // one-way.
        if (options && options.autoSize) {
            this.startAutoSize();
        } else if (options && options.autoSize === false) {
            this.stopAutoSize();
        }

        this.scheduleRender();
    }

    remove() {
        this.removed = true;

        // Removing the chart removes its series, and each of those is owed the
        // same clean-up it would get from `removeSeries`. A page that swaps
        // charts on a route change would otherwise leak whatever every custom
        // series and every primitive was holding.
        for (const pane of this.panes) {
            for (const series of pane.series) {
                try {
                    series.definition.paneView?.destroy?.();
                } catch (error) {
                    // Their clean-up, their problem; ours continues.
                    report(this, error, 'customSeries.destroy');
                }

                for (const primitive of [...series.primitives]) {
                    series.detachPrimitive(primitive);
                }
            }
        }

        if (FULL_BUILD) {
            this.cancelKinetic?.();
            this.cancelKinetic = null;
        }

        if (this.renderHandle !== null) {
            cancelAnimationFrame(this.renderHandle);
            this.renderHandle = null;
        }

        this.stopAutoSize();

        this.element.removeEventListener('mousemove', this.onPointerMove);
        this.element.removeEventListener('mouseleave', this.onPointerLeave);
        this.element.removeEventListener('mousedown', this.onPointerDown);
        this.element.removeEventListener('dblclick', this.onDoubleClick);
        window.removeEventListener('mousemove', this.onDragMove);
        window.removeEventListener('mouseup', this.onPointerUp);
        this.keyboard?.destroy();
        this.keyboard = null;
        this.unwatchTheme?.();
        this.unwatchTheme = null;
        this.element.removeEventListener('wheel', this.onWheel);
        this.element.removeEventListener('touchstart', this.onTouchStart);
        this.element.removeEventListener('touchmove', this.onTouchMove);
        this.element.removeEventListener('touchend', this.onTouchEnd);

        this.element.remove();
        this.panes = [];
        this.crosshairHandlers.clear();
        this.clickHandlers.clear();
        this.dblClickHandlers.clear();
        this.sizeHandlers.clear();
        this.logicalRangeHandlers.clear();
        this.timeRangeHandlers.clear();
    }
}
