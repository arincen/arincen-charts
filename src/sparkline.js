import { createChart } from './index.js';
import { AreaSeries, LineSeries } from './series.js';
import { CrosshairMode } from './options.js';

/**
 * The smallest useful chart, in one call.
 *
 * A sparkline is not a small chart — it is a different object that happens to
 * share a renderer. Six chart options and three series options have to be
 * turned off before a chart becomes a shape in a table cell, and every one of
 * them is a thing to forget. The recipe for it ran to forty lines, which is
 * forty lines copied into thirty table rows.
 *
 * Interaction is off and cannot be turned on. At this size a chart that accepts
 * a drag gets dragged by accident on every scroll of the table it lives in, and
 * the reader has no axis, no scrollbar and no way to get it back. If you want
 * something draggable, you want a chart.
 */

/** Our own green and red, for the direction colouring. */
const RISING = '#22ab94';
const FALLING = '#f23645';

/** The colour is decided on first-against-last, never on the last two. */
function directionColor(values) {
    const first = values.find((point) => Number.isFinite(point.value));
    const last = [...values].reverse().find((point) => Number.isFinite(point.value));

    if (! first || ! last) {
        return RISING;
    }

    return last.value >= first.value ? RISING : FALLING;
}

/** `#22ab94` at some opacity, without asking the caller for a second colour. */
function fade(color, alpha) {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);

    if (! hex) {
        return color;
    }

    const [red, green, blue] = [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16));

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * @param {HTMLElement} container
 * @param {{time: number|string, value: number}[]} values
 * @param {Object} [options]
 * @param {string} [options.color] a colour, or omitted for green/red by direction
 * @param {'area'|'line'} [options.type] filled or not; area by default
 * @param {number} [options.lineWidth]
 * @param {number} [options.width] omitted follows the container
 * @param {number} [options.height]
 * @return {{chart: Object, series: Object, setData: Function, remove: Function}}
 */
export function sparkline(container, values = [], options = {}) {
    const { color, type = 'area', lineWidth = 2, width, height } = options;

    const chart = createChart(container, {
        width,
        height,
        autoSize: width === undefined && height === undefined,

        // Not a chart you can move. See above.
        handleScroll: false,
        handleScale: false,
        crosshair: { mode: CrosshairMode.Hidden },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: false },
        timeScale: { visible: false },
        layout: {
            background: { type: 'solid', color: 'transparent' },
            attributionLogo: false,
        },

        // Whatever is wrong with a hundred rows of data, saying so a hundred
        // times is not the way anybody finds out.
        validateData: false,
    });

    const series = chart.addSeries(type === 'line' ? LineSeries : AreaSeries, {
        lineWidth,

        // Nothing that needs room the cell does not have.
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
    });

    const paint = (data) => {
        const line = color ?? directionColor(data);

        series.applyOptions(type === 'line'
            ? { color: line }
            : { lineColor: line, topColor: fade(line, 0.28), bottomColor: fade(line, 0) });

        series.setData(data);
        chart.timeScale().fitContent();
    };

    paint(values);

    return {
        chart,
        series,

        /** Replaces the readings, and re-reads the direction with them. */
        setData: paint,

        remove: () => chart.remove(),
    };
}
