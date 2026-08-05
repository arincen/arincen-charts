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

function shapeSizeFor(barSpacing, scale) {
    const base = Math.max(8, Math.min(22, Math.round(barSpacing * 0.9)));

    return base * (scale === undefined ? 1 : scale);
}

function drawShape(ctx, shape, x, y, size, color) {
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
        const color = marker.color ?? '#2196f3';
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
            drawShape(ctx, marker.shape ?? 'circle', x, y, size, color);
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
