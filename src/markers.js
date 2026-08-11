import { toTimestamp } from './time.js';

/**
 * Index of the bar closest in time to `timestamp`.
 *
 * Markers routinely arrive as `YYYY-MM-DD` while the series carries intraday
 * timestamps, so an exact match would silently drop them — nearest wins.
 *
 * @param {number[]} timeIndex ascending
 * @param {number} timestamp
 * @return {number}
 */
export function nearestIndex(timeIndex, timestamp) {
    if (! timeIndex.length) {
        return -1;
    }

    let low = 0;
    let high = timeIndex.length - 1;

    while (low < high) {
        const middle = (low + high) >> 1;

        if (timeIndex[middle] < timestamp) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    if (low > 0 && Math.abs(timeIndex[low - 1] - timestamp) <= Math.abs(timeIndex[low] - timestamp)) {
        return low - 1;
    }

    return low;
}

/** What a page is, when the chart has been given no background of its own. */
const LIGHT_PAGE = '#ffffff';
const DARK_PAGE = '#0a0a0a';

function shapeSizeFor(barSpacing, scale) {
    const base = Math.max(8, Math.min(22, Math.round(barSpacing * 0.9)));

    return base * (scale === undefined ? 1 : scale);
}

/**
 * Whether a colour will actually cover what is behind it.
 *
 * @param {string|undefined} color
 * @return {boolean}
 */
function coversWhatIsBehind(color) {
    if (! color || color === 'transparent') {
        return false;
    }

    const alpha = /^rgba\([^)]*,\s*([\d.]+)\s*\)$/.exec(color);

    return ! alpha || Number(alpha[1]) > 0.5;
}

/**
 * How light a colour is, 0 to 255, or null if it cannot be read.
 *
 * @param {string|undefined} color
 * @return {number|null}
 */
function lightness(color) {
    if (! color) {
        return null;
    }

    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());

    if (hex) {
        const digits = hex[1].length === 3
            ? [...hex[1]].map((digit) => digit + digit)
            : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)];

        const [red, green, blue] = digits.map((pair) => parseInt(pair, 16));

        return 0.299 * red + 0.587 * green + 0.114 * blue;
    }

    const parts = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);

    if (! parts) {
        return null;
    }

    return 0.299 * Number(parts[1]) + 0.587 * Number(parts[2]) + 0.114 * Number(parts[3]);
}

/**
 * The colour to ring a marker with.
 *
 * Its own background first. But a transparent background is the *common* case
 * — it is what this site's charts use, what the documentation demos use, and
 * what anybody putting a chart on a styled page uses — and skipping the ring
 * there means the feature never appears where it is most needed.
 *
 * So when there is no background to borrow, the text colour is read instead:
 * pale text means a dark page and a dark ring, dark text means a light page
 * and a white one. It is a guess, but it is the same guess the reader's eye
 * makes, and it is right in every case where the chart's own text is legible.
 *
 * @param {Object} layout
 * @return {string|null}
 */
function outlineColor(layout) {
    const background = layout?.background;
    const behind = background?.type === 'gradient' ? background.topColor : background?.color;

    if (coversWhatIsBehind(behind)) {
        return behind;
    }

    const text = lightness(layout?.textColor);

    if (text === null) {
        return null;
    }

    return text > 140 ? DARK_PAGE : LIGHT_PAGE;
}

function drawShape(ctx, shape, x, y, size, color, outline) {
    const half = size / 2;
    const shaft = Math.max(1, size * 0.13);

    ctx.fillStyle = color;
    ctx.beginPath();

    switch (shape) {
        case 'arrowUp':
            ctx.moveTo(x, y - half);
            ctx.lineTo(x + half, y);
            ctx.lineTo(x + shaft, y);
            ctx.lineTo(x + shaft, y + half);
            ctx.lineTo(x - shaft, y + half);
            ctx.lineTo(x - shaft, y);
            ctx.lineTo(x - half, y);
            ctx.closePath();
            break;
        case 'arrowDown':
            ctx.moveTo(x, y + half);
            ctx.lineTo(x + half, y);
            ctx.lineTo(x + shaft, y);
            ctx.lineTo(x + shaft, y - half);
            ctx.lineTo(x - shaft, y - half);
            ctx.lineTo(x - shaft, y);
            ctx.lineTo(x - half, y);
            ctx.closePath();
            break;
        case 'square':
            ctx.rect(x - half, y - half, size, size);
            break;
        default:
            ctx.arc(x, y, half, 0, Math.PI * 2);
    }

    // Outlined before it is filled, and in the chart's own background: a
    // marker sits on top of the very bars it is pointing at, and a red arrow
    // over a red candle is a shape nobody can find. Stroke first so the ring
    // grows outward from the shape instead of eating half of it.
    if (outline) {
        ctx.strokeStyle = outline;
        ctx.lineWidth = Math.max(1.5, size * 0.14);
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} context
 */
export function drawMarkers(ctx, context) {
    const { series, priceScale, timeScale, timeIndex, plot, font } = context;

    if (! series.markers.length) {
        return;
    }

    const outline = outlineColor(series.chart?.options?.layout);

    ctx.textAlign = 'center';
    ctx.font = font;

    for (const marker of series.markers) {
        const timestamp = toTimestamp(marker.time);

        if (timestamp === null) {
            continue;
        }

        const index = nearestIndex(timeIndex, timestamp);
        const point = series.byIndex[index];

        if (index < 0 || ! point) {
            continue;
        }

        const x = timeScale.indexToX(index);

        if (x < plot.left - 40 || x > plot.right + 40) {
            continue;
        }

        const size = shapeSizeFor(timeScale.barSpacing, marker.size);
        const position = marker.position ?? 'aboveBar';
        const color = marker.color ?? '#db2777';
        const gap = size > 0 ? size * 0.9 : 6;

        let y;

        if (position === 'aboveBar') {
            y = priceScale.priceToY(point.high ?? point.value) - gap;
        } else if (position === 'belowBar') {
            y = priceScale.priceToY(point.low ?? point.value) + gap;
        } else {
            y = priceScale.priceToY(point.value ?? point.close);
        }

        if (size > 0) {
            drawShape(ctx, marker.shape ?? 'circle', x, y, size, color, outline);
        }

        if (marker.text) {
            ctx.fillStyle = color;
            ctx.textBaseline = position === 'belowBar' ? 'top' : 'bottom';
            ctx.fillText(
                marker.text,
                x,
                position === 'belowBar' ? y + size * 0.8 : y - size * 0.8,
            );
        }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}
