import { applyLineStyle, LineStyle } from './options.js';

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
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: '',
        crosshairMarkerBackgroundColor: '',
        crosshairMarkerBorderWidth: 2,
    };
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
    let segment = [];

    for (let index = from; index <= to; index++) {
        const point = series.byIndex[index];

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

function strokeLine(ctx, segment, color, width, style) {
    if (segment.length === 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(segment[0].x, segment[0].y, Math.max(1, width / 2), 0, Math.PI * 2);
        ctx.fill();

        return;
    }

    ctx.beginPath();
    ctx.moveTo(segment[0].x, segment[0].y);

    for (let i = 1; i < segment.length; i++) {
        ctx.lineTo(segment[i].x, segment[i].y);
    }

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
        color: '#2196f3',
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
    }),
    lastValueColor: (options) => options.color,
    draw(ctx, context) {
        const { options } = context;

        eachSegment(context, (segment) => {
            strokeLine(ctx, segment, options.color, options.lineWidth, options.lineStyle);
        });
    },
};

export const AreaSeries = {
    type: 'Area',
    isBarLike: false,
    defaults: () => ({
        ...commonDefaults(),
        topColor: 'rgba(46, 220, 135, 0.4)',
        bottomColor: 'rgba(40, 221, 100, 0)',
        lineColor: '#33d778',
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
        invertFilledArea: false,
    }),
    lastValueColor: (options) => options.lineColor,
    draw(ctx, context) {
        const { options, plot } = context;
        const gradient = ctx.createLinearGradient(0, plot.top, 0, plot.bottom);

        gradient.addColorStop(0, options.invertFilledArea ? options.bottomColor : options.topColor);
        gradient.addColorStop(1, options.invertFilledArea ? options.topColor : options.bottomColor);

        eachSegment(context, (segment) => {
            ctx.beginPath();
            ctx.moveTo(segment[0].x, plot.bottom);

            for (const point of segment) {
                ctx.lineTo(point.x, point.y);
            }

            ctx.lineTo(segment[segment.length - 1].x, plot.bottom);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            strokeLine(ctx, segment, options.lineColor, options.lineWidth, options.lineStyle);
        });
    },
};

export const BaselineSeries = {
    type: 'Baseline',
    isBarLike: false,
    defaults: () => ({
        ...commonDefaults(),
        baseValue: { type: 'price', price: 0 },
        topLineColor: 'rgba(38, 166, 154, 1)',
        topFillColor1: 'rgba(38, 166, 154, 0.28)',
        topFillColor2: 'rgba(38, 166, 154, 0.05)',
        bottomLineColor: 'rgba(239, 83, 80, 1)',
        bottomFillColor1: 'rgba(239, 83, 80, 0.05)',
        bottomFillColor2: 'rgba(239, 83, 80, 0.28)',
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
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

                for (const point of segment) {
                    ctx.lineTo(point.x, point.y);
                }

                ctx.lineTo(segment[segment.length - 1].x, base);
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();

                strokeLine(ctx, segment, lineColor, options.lineWidth, options.lineStyle);
            });

            ctx.restore();
        };

        half(plot.top, base, options.topFillColor1, options.topFillColor2, options.topLineColor);
        half(base, plot.bottom, options.bottomFillColor1, options.bottomFillColor2, options.bottomLineColor);
    },
};

const SPECIAL_SPACING_FROM = 2.5;
const SPECIAL_SPACING_TO = 4;

/**
 * Candle body width in *device* pixels.
 *
 * Everything about a candle is solved in device pixels: on a dense daily
 * series the body is only five or six of them wide, so a rounding done in CSS
 * pixels first would swing the result by a third of the candle.
 *
 * @param {number} barSpacing CSS px between bar centres
 * @param {number} pixelRatio
 * @return {number}
 */
function barBodyWidth(barSpacing, pixelRatio) {
    if (barSpacing >= SPECIAL_SPACING_FROM && barSpacing <= SPECIAL_SPACING_TO) {
        return Math.floor(3 * pixelRatio);
    }

    const taper = 1 - 0.2 * Math.atan(Math.max(SPECIAL_SPACING_TO, barSpacing) - SPECIAL_SPACING_TO) / (Math.PI * 0.5);
    const tapered = Math.floor(barSpacing * taper * pixelRatio);
    const capped = Math.min(tapered, Math.floor(barSpacing * pixelRatio));

    return Math.max(Math.floor(pixelRatio), capped);
}

/**
 * How thick the outline around a candle body is, in device pixels.
 *
 * The border is drawn *inside* the body width, never around it. Around it
 * would add two pixels to every candle's footprint, and at the three-or-so
 * pixels of spacing a year of daily bars leaves, that is the difference
 * between separated candles and a solid wall of colour.
 *
 * @param {number} bodyWidth Device px
 * @param {number} pixelRatio
 * @return {number}
 */
function candleBorderWidth(bodyWidth, pixelRatio) {
    const hairline = Math.floor(pixelRatio);
    const fitted = bodyWidth <= 2 * hairline
        ? Math.max(hairline, Math.floor((bodyWidth - 1) * 0.5))
        : hairline;

    return bodyWidth <= fitted * 2 ? hairline : fitted;
}

/**
 * Draws a rectangle outline whose stroke sits inside the given bounds.
 */
function fillInnerBorder(ctx, x, y, width, height, border, scale) {
    ctx.fillRect((x + border) * scale, y * scale, (width - border * 2) * scale, border * scale);
    ctx.fillRect((x + border) * scale, (y + height - border) * scale, (width - border * 2) * scale, border * scale);
    ctx.fillRect(x * scale, y * scale, border * scale, height * scale);
    ctx.fillRect((x + width - border) * scale, y * scale, border * scale, height * scale);
}

export const CandlestickSeries = {
    type: 'Candlestick',
    isBarLike: true,
    defaults: () => ({
        ...commonDefaults(),
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: true,
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickVisible: true,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
    }),
    lastValueColor: (options, point) => (
        point && point.close >= point.open ? options.upColor : options.downColor
    ),
    draw(ctx, context) {
        const { series, options, priceScale, timeScale, pixelRatio, from, to } = context;
        const scale = 1 / pixelRatio;
        const hairline = Math.floor(pixelRatio);

        let bodyWidth = barBodyWidth(timeScale.barSpacing, pixelRatio);

        // Grid lines and the crosshair are a hairline wide. Giving the body the
        // same odd/even parity keeps a candle centred under the crosshair
        // rather than sitting half a pixel to one side of it.
        if (bodyWidth >= 2 && (hairline % 2) !== (bodyWidth % 2)) {
            bodyWidth--;
        }

        const borderWidth = candleBorderWidth(bodyWidth, pixelRatio);
        const halfBody = Math.floor(bodyWidth * 0.5);
        const solidBorder = timeScale.barSpacing * pixelRatio <= borderWidth * 2;
        const fillsBody = ! options.borderVisible || bodyWidth > borderWidth * 2;
        const wickWidth = Math.max(1, hairline);
        const wickOffset = Math.floor(wickWidth * 0.5);

        let previousWickEdge = null;
        let previousBodyEdge = null;

        for (let index = from; index <= to; index++) {
            const point = series.byIndex[index];

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

                ctx.fillStyle = isUp ? options.wickUpColor : options.wickDownColor;
                ctx.fillRect(left * scale, high * scale, width, (top - high) * scale);
                ctx.fillRect(left * scale, (bottom + 1) * scale, width, (low - bottom) * scale);

                previousWickEdge = right;
            }

            const bodyRight = centre - halfBody + bodyWidth - 1;
            const bodyLeft = previousBodyEdge === null
                ? centre - halfBody
                : Math.min(Math.max(previousBodyEdge + 1, centre - halfBody), bodyRight);

            if (options.borderVisible) {
                ctx.fillStyle = isUp ? options.borderUpColor : options.borderDownColor;

                if (solidBorder) {
                    ctx.fillRect(bodyLeft * scale, top * scale, (bodyRight - bodyLeft + 1) * scale, (bottom - top + 1) * scale);
                } else {
                    fillInnerBorder(ctx, bodyLeft, top, bodyRight - bodyLeft + 1, bottom - top + 1, borderWidth, scale);
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
                ctx.fillStyle = isUp ? options.upColor : options.downColor;
                ctx.fillRect(
                    (bodyLeft + inset) * scale,
                    fillTop * scale,
                    (bodyRight - bodyLeft + 1 - inset * 2) * scale,
                    (fillBottom - fillTop + 1) * scale,
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
        upColor: '#26a69a',
        downColor: '#ef5350',
        openVisible: true,
        thinBars: true,
    }),
    lastValueColor: (options, point) => (
        point && point.close >= point.open ? options.upColor : options.downColor
    ),
    draw(ctx, context) {
        const { series, options, priceScale, timeScale, from, to } = context;
        const tick = Math.max(1, Math.floor(timeScale.barSpacing * 0.35));

        ctx.lineWidth = options.thinBars ? 1 : Math.max(1, Math.floor(timeScale.barSpacing * 0.2));

        for (let index = from; index <= to; index++) {
            const point = series.byIndex[index];

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
        color: '#26a69a',
        base: 0,
        priceLineVisible: false,
        lastValueVisible: false,
    }),
    lastValueColor: (options) => options.color,
    draw(ctx, context) {
        const { series, options, priceScale, timeScale, from, to } = context;
        const width = Math.max(1, Math.floor(timeScale.barSpacing * 0.8));
        const half = Math.floor(width / 2);
        const baseY = priceScale.priceToY(options.base);

        for (let index = from; index <= to; index++) {
            const point = series.byIndex[index];

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
        raw: item,
    };
}
