import { applyLineStyle, LastPriceAnimationMode, LineStyle, LineType, PriceLineSource } from './options.js';
import { FULL_BUILD } from './flags.js';

export function commonDefaults() {
    return {
        visible: true,
        title: '',
        priceLineVisible: true,
        priceLineColor: '',
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderColor: '',
        crosshairMarkerBackgroundColor: '',
        crosshairMarkerBorderWidth: 2,
        ...structuralDefaults(),
    };
}

/**
 * Options only the full build can act on, so only the full build carries them.
 *
 * A default is not free: it is a string in the bundle and a key merged on every
 * series. Shipping the base-line colours to a build whose price scale has no
 * percentage mode, or an animation mode it never reads, spends the budget on
 * nothing — and the budget is the product.
 *
 * Written as a folded conditional rather than a flagged branch inside
 * `commonDefaults`, so the whole object literal disappears from the light
 * build instead of merely going unread.
 */
function structuralDefaults() {
    return FULL_BUILD
        ? {
            // Off by default. An animation nobody asked for is a frame
            // requested forever, and most charts on a page are not live.
            lastPriceAnimation: LastPriceAnimationMode.Disabled,

            // Which reading the price line and the last-value badge follow.
            // `LastVisible` keeps them on the bar at the right edge, so
            // scrolling back through history moves the line with you instead
            // of leaving it pinned to a price that is off screen.
            priceLineSource: PriceLineSource.LastBar,

            // Overrides the chart's smoothing for this series alone, so a
            // sparkline beside a main chart can be smoothed harder.
            conflationThresholdFactor: undefined,

            // The zero line of a percentage or indexed axis. Meaningless on a
            // normal one, and not drawn there.
            baseLineVisible: true,
            baseLineColor: '#a3a3a3',
            baseLineWidth: 1,
            baseLineStyle: LineStyle.Solid,
        }
        : {};
}

/** Point markers are a full-build option, for the same reason. */
function markerDefaults() {
    return FULL_BUILD ? { pointMarkersVisible: false, pointMarkersRadius: undefined } : {};
}

function crisp(value, lineWidth) {
    return lineWidth % 2 === 0 ? Math.round(value) : Math.round(value) + 0.5;
}

/**
 * Walks the visible slice and hands each drawn segment to `onSegment`.
 * A missing point or a null value ends the current segment, which is how
 * whitespace gaps stay gaps instead of being bridged by a straight line.
 */
function eachSegment(context, onSegment) {
    const { series, priceScale, timeScale, from, to } = context;

    // The conflated view, when there is one, is laid out on the same indices
    // and walked in strides — so this loop is unchanged apart from how far it
    // steps and which array it reads.
    const source = context.conflated ?? series.byIndex;
    const step = context.step ?? 1;
    let segment = [];

    // Started at the run containing the left edge, not at the edge itself, or
    // the run straddling it would go undrawn and the line would begin late.
    for (let index = Math.floor(from / step) * step; index <= to; index += step) {
        const point = source[index / step];

        if (! point || point.value === null || point.value === undefined) {
            if (segment.length) {
                onSegment(segment);
                segment = [];
            }

            continue;
        }

        segment.push({
            x: timeScale.indexToX(index),
            y: priceScale.priceToY(point.value),
        });
    }

    if (segment.length) {
        onSegment(segment);
    }
}

/** How far a curve's control points reach towards their neighbours. */
const CURVE_TENSION = 0.25;

/**
 * Lays a segment down as a path, in whichever shape the series asked for.
 *
 * Shared by the line, the area and the baseline rather than written three
 * times: the area's fill and the line drawn on top of it have to follow the
 * same route, and a stepped area whose outline was diagonal would show a
 * sliver of fill above its own edge.
 *
 * The curve is a Catmull-Rom spline expressed as béziers — control points
 * pulled a quarter of the way towards each neighbour. It passes through every
 * point, which a plain bézier through the same points does not, and a chart
 * whose curve misses its own data would be worse than no curve at all.
 *
 * Continues from wherever the path already is, and never issues `moveTo` — the
 * caller places the pen on the first point. A `moveTo` here would start a new
 * subpath, orphaning the edge an area has already drawn down to its baseline,
 * and `closePath` would then cut a diagonal straight across the fill.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} segment
 * @param {number} lineType
 */
export function tracePath(ctx, segment, lineType) {
    if (lineType === LineType.WithSteps) {
        for (let i = 1; i < segment.length; i++) {
            ctx.lineTo(segment[i].x, segment[i - 1].y);
            ctx.lineTo(segment[i].x, segment[i].y);
        }

        return;
    }

    if (lineType === LineType.Curved && segment.length > 2) {
        for (let i = 0; i < segment.length - 1; i++) {
            const before = segment[i - 1] ?? segment[i];
            const from = segment[i];
            const to = segment[i + 1];
            const after = segment[i + 2] ?? to;

            ctx.bezierCurveTo(
                from.x + (to.x - before.x) * CURVE_TENSION,
                from.y + (to.y - before.y) * CURVE_TENSION,
                to.x - (after.x - from.x) * CURVE_TENSION,
                to.y - (after.y - from.y) * CURVE_TENSION,
                to.x,
                to.y,
            );
        }

        return;
    }

    for (let i = 1; i < segment.length; i++) {
        ctx.lineTo(segment[i].x, segment[i].y);
    }
}

/**
 * A dot on each reading.
 *
 * On sparse data — quarterly earnings, a dividend history — a bare line makes
 * ten observations look like a continuous stream. The markers say which points
 * were measured and which of the line was drawn between them.
 */
function drawPointMarkers(ctx, segment, color, radius) {
    ctx.fillStyle = color;

    for (const point of segment) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** The radius to use when the caller asked for markers but not for a size. */
function markerRadius(options) {
    return options.pointMarkersRadius ?? Math.max(2, options.lineWidth + 1);
}

function strokeLine(ctx, segment, color, width, style, lineType = LineType.Simple) {
    if (segment.length === 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(segment[0].x, segment[0].y, Math.max(1, width / 2), 0, Math.PI * 2);
        ctx.fill();

        return;
    }

    ctx.beginPath();
    ctx.moveTo(segment[0].x, segment[0].y);
    tracePath(ctx, segment, lineType);

    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    applyLineStyle(ctx, style, width);
    ctx.stroke();
    ctx.setLineDash([]);
}

export const LineSeries = {
    type: 'Line',
    isBarLike: false,
    defaults: () => ({
        ...commonDefaults(),
        color: '#db2777',
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
        lineType: LineType.Simple,
        ...markerDefaults(),
    }),
    lastValueColor: (options) => options.color,
    draw(ctx, context) {
        const { options } = context;

        eachSegment(context, (segment) => {
            strokeLine(ctx, segment, options.color, options.lineWidth, options.lineStyle, options.lineType);

            if (FULL_BUILD && options.pointMarkersVisible) {
                drawPointMarkers(ctx, segment, options.color, markerRadius(options));
            }
        });
    },
};

export const AreaSeries = {
    type: 'Area',
    isBarLike: false,
    defaults: () => ({
        ...commonDefaults(),
        topColor: 'rgba(219, 39, 119, 0.28)',
        bottomColor: 'rgba(219, 39, 119, 0.02)',
        lineColor: '#db2777',
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
        lineType: LineType.Simple,
        invertFilledArea: false,

        // Carry this fill into the price and time axis strips, so the whole
        // chart reads as one coloured object rather than a coloured middle
        // between two grey gutters.
        tintAxes: false,
        ...markerDefaults(),
    }),
    lastValueColor: (options) => options.lineColor,
    draw(ctx, context) {
        const { options, plot } = context;
        const gradient = ctx.createLinearGradient(0, plot.top, 0, plot.bottom);

        gradient.addColorStop(0, options.invertFilledArea ? options.bottomColor : options.topColor);
        gradient.addColorStop(1, options.invertFilledArea ? options.topColor : options.bottomColor);

        eachSegment(context, (segment) => {
            // The fill follows the same route as the outline: a stepped area
            // closed with a diagonal would show a sliver of fill above its own
            // edge, which reads as a rendering fault.
            ctx.beginPath();
            ctx.moveTo(segment[0].x, plot.bottom);
            ctx.lineTo(segment[0].x, segment[0].y);
            tracePath(ctx, segment, options.lineType);
            ctx.lineTo(segment[segment.length - 1].x, plot.bottom);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            strokeLine(ctx, segment, options.lineColor, options.lineWidth, options.lineStyle, options.lineType);

            if (FULL_BUILD && options.pointMarkersVisible) {
                drawPointMarkers(ctx, segment, options.lineColor, markerRadius(options));
            }
        });
    },
};

export const BaselineSeries = {
    type: 'Baseline',
    isBarLike: false,
    defaults: () => ({
        ...commonDefaults(),
        baseValue: { type: 'price', price: 0 },
        topLineColor: 'rgba(34, 171, 148, 1)',
        topFillColor1: 'rgba(34, 171, 148, 0.28)',
        topFillColor2: 'rgba(34, 171, 148, 0.05)',
        bottomLineColor: 'rgba(242, 54, 69, 1)',
        bottomFillColor1: 'rgba(242, 54, 69, 0.05)',
        bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
        lineType: LineType.Simple,
        ...markerDefaults(),
    }),
    lastValueColor: (options, point) => (
        point && point.value >= (options.baseValue?.price ?? 0)
            ? options.topLineColor
            : options.bottomLineColor
    ),

    /**
     * Filled and stroked differently above and below a base price.
     *
     * Both halves are drawn from the same path and then clipped — once to the
     * region above the baseline, once below. Splitting the series into two
     * paths instead would need every crossing solved exactly, and a segment
     * that crosses the base twice between neighbouring points would still come
     * out wrong.
     */
    draw(ctx, context) {
        const { options, priceScale, plot } = context;
        const base = Math.round(priceScale.priceToY(options.baseValue?.price ?? 0));

        const half = (top, bottom, fillFrom, fillTo, lineColor) => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(plot.left, top, plot.right - plot.left, Math.max(0, bottom - top));
            ctx.clip();

            const gradient = ctx.createLinearGradient(0, top, 0, bottom);

            gradient.addColorStop(0, fillFrom);
            gradient.addColorStop(1, fillTo);

            eachSegment(context, (segment) => {
                ctx.beginPath();
                ctx.moveTo(segment[0].x, base);
                ctx.lineTo(segment[0].x, segment[0].y);
                tracePath(ctx, segment, options.lineType);
                ctx.lineTo(segment[segment.length - 1].x, base);
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();

                strokeLine(ctx, segment, lineColor, options.lineWidth, options.lineStyle, options.lineType);

                if (FULL_BUILD && options.pointMarkersVisible) {
                    drawPointMarkers(ctx, segment, lineColor, markerRadius(options));
                }
            });

            ctx.restore();
        };

        half(plot.top, base, options.topFillColor1, options.topFillColor2, options.topLineColor);
        half(base, plot.bottom, options.bottomFillColor1, options.bottomFillColor2, options.bottomLineColor);
    },
};

/**
 * How much of the space between two bars a candle body fills.
 *
 * A flat proportion, not a curve. The alternative is to narrow the fill as
 * bars spread out, which needs a tuned easing function and produces candles
 * whose relationship to the space around them keeps changing. Holding it
 * constant means the rhythm of the chart is the same whether you are looking
 * at a fortnight or a decade, and the gap is guaranteed rather than emergent.
 */
const BODY_FILL = 0.72;

/** Below this, bars are too close together for a gap to survive rounding. */
const MIN_GAP = 1;

/** Corner radius on a candle body when the options do not say, in CSS pixels. */
const BODY_RADIUS = 2;

/**
 * Narrower than this, in device pixels, and a body is drawn square.
 *
 * Width only, deliberately. A daily candle is five or six device pixels across
 * and a two-pixel radius on that is most of the shape, so below this it stops
 * reading as a body and starts reading as a blob — and the anti-aliasing costs
 * the crisp edges the width solver went to trouble for.
 *
 * Height is not part of the test even though a short body has the same problem,
 * because every candle on a chart shares a width and none of them shares a
 * height. Testing height too meant a tall body was rounded and its neighbour
 * was not, on the same chart, at the same zoom — which does not read as a
 * considered rule, it reads as a rendering fault. A short body is protected by
 * tapering its radius instead, below.
 */
const MIN_ROUNDED_BODY = 7;

/**
 * A candle body, rounded when there is room for it and square when there is not.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} radius already in device pixels; 0 draws a plain rectangle
 */
function traceRoundedBox(ctx, x, y, width, height, radius) {
    const right = x + width;
    const bottom = y + height;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(right - radius, y);
    ctx.quadraticCurveTo(right, y, right, y + radius);
    ctx.lineTo(right, bottom - radius);
    ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
    ctx.lineTo(x + radius, bottom);
    ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function fillBody(ctx, x, y, width, height, radius) {
    if (radius <= 0) {
        ctx.fillRect(x, y, width, height);

        return;
    }

    traceRoundedBox(ctx, x, y, width, height, radius);
    ctx.fill();
}

/**
 * How much to round a body of this size, in device pixels.
 *
 * @return {number} 0 when the shape is too small to carry a radius
 */
function cornerRadius(width, height, pixelRatio, wanted = BODY_RADIUS) {
    if (wanted <= 0 || width < MIN_ROUNDED_BODY) {
        return 0;
    }

    // A third of the height, so a body that is two pixels tall gets two thirds
    // of a pixel rather than a full radius — rounded on the same rule as its
    // neighbours, and still a line rather than a lozenge.
    return Math.min(wanted * pixelRatio, width / 4, height / 3);
}

/**
 * Candle body width in *device* pixels.
 *
 * Solved in device pixels and never in CSS pixels: on a dense daily series the
 * body is five or six device pixels wide, so rounding before the ratio is
 * applied swings the result by a third of a candle.
 *
 * The width is capped so at least one device pixel of background always
 * separates two candles, until the bars are so tight that a gap would cost the
 * candle its last pixel — at which point being visible matters more than being
 * separate.
 *
 * @param {number} barSpacing CSS px between bar centres
 * @param {number} pixelRatio
 * @return {number}
 */
function barBodyWidth(barSpacing, pixelRatio) {
    const spacing = barSpacing * pixelRatio;
    const hairline = Math.max(1, Math.floor(pixelRatio));
    const parity = hairline % 2;

    // Grid lines and the crosshair are a hairline wide, and a body of the
    // opposite parity sits half a pixel off centre beneath them. Rounded to the
    // nearest width of the right parity rather than shrunk to reach it — the
    // obvious way — which quietly costs the candle a pixel it had earned.
    const filled = Math.round((spacing * BODY_FILL - parity) / 2) * 2 + parity;

    // At least one pixel of background between neighbours, until the bars are
    // so tight that a gap would cost the candle its last pixel; being visible
    // matters more then than being separate.
    const room = Math.floor(spacing) - MIN_GAP;
    const separated = room >= hairline ? Math.min(filled, room) : hairline;

    return Math.max(hairline, separated, 1);
}

/**
 * Outlines a candle body, with the stroke lying *inside* the bounds given.
 *
 * Inside, never around: an outline drawn around the body would add two pixels
 * to every candle's footprint, and at the three-or-so pixels of spacing a year
 * of daily bars leaves, that is the difference between separated candles and a
 * solid wall of colour. Canvas centres a stroke on its path, so the path is
 * inset by half the line width and shrunk by a whole one.
 *
 * A body too small to hold an outline and something inside it is filled
 * instead. A doji is a line; asking for an outline around a line either paints
 * outside the body or leaves nothing in the middle, and both look like a
 * rendering fault rather than a candle.
 *
 * Every measurement here is device pixels; `scale` returns them to the CSS
 * pixels the context is drawing in.
 */
function outlineBody(ctx, x, y, width, height, border, scale, radius = 0) {
    if (width <= border * 2 || height <= border * 2) {
        // Filled solid rather than outlined, and still rounded on the same
        // rule as everything else. Left square here, a doji came out with
        // corners while both its neighbours did not — the one shape on the
        // chart drawn to a different rule, which is what the eye finds.
        fillBody(ctx, x * scale, y * scale, width * scale, height * scale, radius);

        return;
    }

    ctx.lineWidth = border * scale;

    if (radius <= 0) {
        ctx.strokeRect(
            (x + border / 2) * scale,
            (y + border / 2) * scale,
            (width - border) * scale,
            (height - border) * scale,
        );

        return;
    }

    // The outline follows the same curve as the fill inside it. Left square
    // while the fill was rounded, the corners showed a notch of background
    // between the two — nothing covered the ground the curve gave up.
    traceRoundedBox(
        ctx,
        (x + border / 2) * scale,
        (y + border / 2) * scale,
        (width - border) * scale,
        (height - border) * scale,
        Math.max(0, radius - (border / 2) * scale),
    );
    ctx.stroke();
}

export const CandlestickSeries = {
    type: 'Candlestick',
    isBarLike: true,
    defaults: () => ({
        ...commonDefaults(),
        // Arincen's green and red. Deliberately not the palette the library
        // this API is modelled on ships: an identical default palette is the
        // first thing anyone comparing the two sees, and it is the one
        // similarity with no functional or legal reason to exist. Anyone
        // migrating sets these explicitly anyway.
        upColor: '#22ab94',
        downColor: '#f23645',
        borderVisible: true,
        borderUpColor: '#22ab94',
        borderDownColor: '#f23645',
        wickVisible: true,
        wickUpColor: '#22ab94',
        wickDownColor: '#f23645',

        // Corner radius in CSS pixels; 0 draws square bodies. Applied only
        // where the body is wide enough to carry it, and tapered on short
        // bodies, so every candle on a chart is treated the same way.
        bodyRadius: 2,
    }),
    lastValueColor: (options, point) => (
        point && point.close >= point.open ? options.upColor : options.downColor
    ),
    draw(ctx, context) {
        const { series, options, priceScale, timeScale, pixelRatio, from, to } = context;
        const source = context.conflated ?? series.byIndex;
        const step = context.step ?? 1;
        const scale = 1 / pixelRatio;
        const hairline = Math.floor(pixelRatio);

        // Parity is settled inside the width rule, so nothing is shaved off here.
        const bodyWidth = barBodyWidth(timeScale.barSpacing, pixelRatio);

        // One hairline, like every other line the chart draws. A border that
        // thickened with the body would eat a fixed proportion of it, so the
        // fill colour — the thing that says up or down — would fade out as you
        // zoomed in, which is exactly backwards.
        const borderWidth = Math.max(1, hairline);
        const halfBody = Math.floor(bodyWidth * 0.5);
        const solidBorder = timeScale.barSpacing * pixelRatio <= borderWidth * 2;
        const fillsBody = ! options.borderVisible || bodyWidth > borderWidth * 2;
        const wickWidth = Math.max(1, hairline);
        const wickOffset = Math.floor(wickWidth * 0.5);

        let previousWickEdge = null;
        let previousBodyEdge = null;

        for (let index = Math.floor(from / step) * step; index <= to; index += step) {
            const point = source[index / step];

            if (! point || point.close === null || point.close === undefined) {
                continue;
            }

            const isUp = point.close >= point.open;
            const centre = Math.round(timeScale.indexToX(index) * pixelRatio);
            const openY = Math.round(priceScale.priceToY(point.open) * pixelRatio);
            const closeY = Math.round(priceScale.priceToY(point.close) * pixelRatio);
            const top = Math.min(openY, closeY);
            const bottom = Math.max(openY, closeY);

            if (options.wickVisible) {
                const right = centre - wickOffset + wickWidth - 1;
                const left = previousWickEdge === null
                    ? centre - wickOffset
                    : Math.min(Math.max(previousWickEdge + 1, centre - wickOffset), right);
                const high = Math.round(priceScale.priceToY(point.high) * pixelRatio);
                const low = Math.round(priceScale.priceToY(point.low) * pixelRatio);
                const width = (right - left + 1) * scale;

                ctx.fillStyle = point.wickColor ?? (isUp ? options.wickUpColor : options.wickDownColor);
                ctx.fillRect(left * scale, high * scale, width, (top - high) * scale);
                ctx.fillRect(left * scale, (bottom + 1) * scale, width, (low - bottom) * scale);

                previousWickEdge = right;
            }

            const bodyRight = centre - halfBody + bodyWidth - 1;
            const bodyLeft = previousBodyEdge === null
                ? centre - halfBody
                : Math.min(Math.max(previousBodyEdge + 1, centre - halfBody), bodyRight);

            if (options.borderVisible) {
                ctx.fillStyle = ctx.strokeStyle = point.borderColor
                    ?? (isUp ? options.borderUpColor : options.borderDownColor);

                if (solidBorder) {
                    const boxWidth = (bodyRight - bodyLeft + 1) * scale;
                    const boxHeight = (bottom - top + 1) * scale;

                    fillBody(
                        ctx,
                        bodyLeft * scale,
                        top * scale,
                        boxWidth,
                        boxHeight,
                        cornerRadius(boxWidth, boxHeight, pixelRatio, options.bodyRadius),
                    );
                } else {
                    const outlineWidth = (bodyRight - bodyLeft + 1) * scale;
                    const outlineHeight = (bottom - top + 1) * scale;

                    outlineBody(
                        ctx,
                        bodyLeft,
                        top,
                        bodyRight - bodyLeft + 1,
                        bottom - top + 1,
                        borderWidth,
                        scale,
                        cornerRadius(outlineWidth, outlineHeight, pixelRatio, options.bodyRadius),
                    );
                }
            }

            previousBodyEdge = bodyRight;

            if (! fillsBody) {
                continue;
            }

            const inset = options.borderVisible ? borderWidth : 0;
            const fillTop = top + inset;
            const fillBottom = bottom - inset;

            if (fillTop <= fillBottom) {
                const fillWidth = (bodyRight - bodyLeft + 1 - inset * 2) * scale;
                const fillHeight = (fillBottom - fillTop + 1) * scale;

                ctx.fillStyle = point.color ?? (isUp ? options.upColor : options.downColor);

                // Measured from the body, not from the inset rectangle. Sizing
                // the radius to the fill made it smaller than the outline's,
                // and the difference showed as a notch of background in every
                // corner — the fill's curve cut inside the border's, and
                // nothing covered the ground between them.
                const bodyWidthPx = (bodyRight - bodyLeft + 1) * scale;
                const bodyHeightPx = (bottom - top + 1) * scale;
                const outer = cornerRadius(bodyWidthPx, bodyHeightPx, pixelRatio, options.bodyRadius);

                fillBody(
                    ctx,
                    (bodyLeft + inset) * scale,
                    fillTop * scale,
                    fillWidth,
                    fillHeight,
                    outer <= 0 ? 0 : Math.max(0, outer - inset * scale),
                );
            }
        }
    },
};

export const BarSeries = {
    type: 'Bar',
    isBarLike: true,
    defaults: () => ({
        ...commonDefaults(),
        upColor: '#22ab94',
        downColor: '#f23645',
        openVisible: true,
        thinBars: true,
    }),
    lastValueColor: (options, point) => (
        point && point.close >= point.open ? options.upColor : options.downColor
    ),
    draw(ctx, context) {
        const { series, options, priceScale, timeScale, from, to } = context;
        const tick = Math.max(1, Math.floor(timeScale.barSpacing * 0.3));
        const source = context.conflated ?? series.byIndex;
        const step = context.step ?? 1;

        ctx.lineWidth = options.thinBars ? 1 : Math.max(1, Math.floor(timeScale.barSpacing * 0.14));

        for (let index = Math.floor(from / step) * step; index <= to; index += step) {
            const point = source[index / step];

            if (! point || point.close === null || point.close === undefined) {
                continue;
            }

            const centre = crisp(timeScale.indexToX(index), ctx.lineWidth);

            ctx.strokeStyle = point.close >= point.open ? options.upColor : options.downColor;
            ctx.beginPath();
            ctx.moveTo(centre, priceScale.priceToY(point.high));
            ctx.lineTo(centre, priceScale.priceToY(point.low));

            if (options.openVisible) {
                const openY = crisp(priceScale.priceToY(point.open), ctx.lineWidth);

                ctx.moveTo(centre - tick, openY);
                ctx.lineTo(centre, openY);
            }

            const closeY = crisp(priceScale.priceToY(point.close), ctx.lineWidth);

            ctx.moveTo(centre, closeY);
            ctx.lineTo(centre + tick, closeY);
            ctx.stroke();
        }
    },
};

export const HistogramSeries = {
    type: 'Histogram',
    isBarLike: true,
    defaults: () => ({
        ...commonDefaults(),
        color: '#22ab94',
        base: 0,
        priceLineVisible: false,
        lastValueVisible: false,
    }),
    lastValueColor: (options) => options.color,
    draw(ctx, context) {
        const { series, options, priceScale, timeScale, from, to } = context;
        const width = Math.max(1, Math.floor(timeScale.barSpacing * 0.72));
        const half = Math.floor(width / 2);
        const baseY = priceScale.priceToY(options.base);
        const source = context.conflated ?? series.byIndex;
        const step = context.step ?? 1;

        for (let index = Math.floor(from / step) * step; index <= to; index += step) {
            const point = source[index / step];

            if (! point || point.value === null || point.value === undefined) {
                continue;
            }

            const y = priceScale.priceToY(point.value);

            ctx.fillStyle = point.color ?? options.color;
            ctx.fillRect(
                Math.round(timeScale.indexToX(index)) - half,
                Math.round(Math.min(y, baseY)),
                width,
                Math.max(1, Math.abs(Math.round(baseY) - Math.round(y))),
            );
        }
    },
};

/**
 * Normalises a raw data point, keeping the caller's original `time` so it can
 * be handed back untouched through crosshair events.
 *
 * @param {Object} item
 * @param {number} timestamp
 * @return {Object}
 */
export function normalisePoint(item, timestamp) {
    return {
        ts: timestamp,
        time: item.time,
        value: item.value ?? item.close ?? null,
        open: item.open ?? item.value ?? null,
        high: item.high ?? item.value ?? null,
        low: item.low ?? item.value ?? null,
        close: item.close ?? item.value ?? null,
        color: item.color,

        // Per-reading overrides. A single candle can be given its own body,
        // outline or wick — which is how a chart marks one bar out from the
        // rest without a second series drawn on top of the first.
        borderColor: item.borderColor,
        wickColor: item.wickColor,
        raw: item,
    };
}
