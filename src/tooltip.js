/**
 * A tooltip that follows the crosshair.
 *
 * The library this API is modelled on has none, so every application that uses
 * it writes the same thirty lines: subscribe to the crosshair, guard the
 * pointer-left case, read `seriesData`, format the numbers, position an
 * absolutely-placed div, and remember to flip it near the edges. Most get the
 * guard wrong and leave the last value frozen on screen, and almost all of them
 * forget the flip, so the tooltip runs off the right-hand side of the chart.
 *
 * It is a DOM element, not something painted on the canvas. Text on a canvas
 * cannot be selected, copied, read by a screen reader, wrapped by the browser,
 * or styled by the page it lives on — and a tooltip is text. The cost is one
 * element per chart, positioned on frames the pointer moves, which is work the
 * browser is better at than we are.
 *
 * Nothing here reaches into the chart's internals: it uses the same public
 * crosshair subscription a caller would, which is what keeps it honest as an
 * example of the API rather than a privileged special case.
 */

/** Kept here rather than imported: the tooltip is a full-build attachment and
 * should not pull the options module into a caller that only wants a tooltip. */
const RTL = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku'];

/** Distance kept between the pointer and the corner of the tooltip. */
const OFFSET = 14;

/** How close to an edge before the tooltip flips to the other side. */
const EDGE = 8;

const DEFAULTS = {
    visible: true,

    /**
     * `'pointer'` follows the crosshair. `'top-left'` and `'top-right'` pin it
     * to a corner, which is what a chart with a busy plot usually wants: a
     * tooltip that moves is a tooltip the reader's eye has to chase.
     */
    position: 'pointer',

    /** Show the time above the values. */
    showTime: true,

    /** Series to report, or null for every series with a reading. */
    series: null,

    /**
     * `(payload) => string | HTMLElement | null`
     *
     * Given the reading and the chart, return the contents. Returning a string
     * sets `textContent`, never `innerHTML` — a formatter is handed values from
     * a data feed, and a feed that can put markup on your page is a feed that
     * can put a script on it.
     */
    formatter: null,

    /** Merged into the element's inline style, so a page can restyle it. */
    style: {},

    /** Added to the element, for styling from your own stylesheet. */
    className: '',
};

const BASE_STYLE = {
    position: 'absolute',
    zIndex: '4',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    padding: '7px 10px',
    borderRadius: '8px',
    background: 'rgba(10, 10, 10, 0.92)',
    color: '#fafafa',
    font: '500 12px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    whiteSpace: 'nowrap',
    display: 'none',
};

/**
 * @param {Object} chart the value returned by `createChart`
 * @param {Object} [options]
 * @return {{applyOptions: Function, options: Function, element: Function, remove: Function}}
 */
export function createTooltip(chart, options) {
    let settings = { ...DEFAULTS, ...(options ?? {}) };

    const element = document.createElement('div');

    Object.assign(element.style, BASE_STYLE, settings.style);

    if (settings.className) {
        element.className = settings.className;
    }

    // The chart knows which way its locale runs; the tooltip is its text, so
    // it inherits that rather than the page's. A chart set to Arabic inside an
    // English page should still read as Arabic.
    element.setAttribute('dir', chart.options().localization.locale
        && RTL.includes(String(chart.options().localization.locale).toLowerCase().split(/[-_]/)[0])
        ? 'rtl'
        : 'ltr');

    chart.chartElement().appendChild(element);

    const hide = () => {
        element.style.display = 'none';
    };

    /** @param {Object} param the crosshair payload */
    const update = (param) => {
        if (! settings.visible || ! param.time || ! param.point) {
            hide();

            return;
        }

        const wanted = settings.series ?? [...param.seriesData.keys()];
        const readings = wanted
            .map((series) => ({ series, point: param.seriesData.get(series) }))
            .filter((entry) => entry.point);

        if (! readings.length) {
            hide();

            return;
        }

        if (! render(element, chart, param, readings, settings)) {
            hide();

            return;
        }

        element.style.display = 'block';
        place(element, chart, param, settings.position);
    };

    chart.subscribeCrosshairMove(update);

    return {
        applyOptions(next) {
            settings = { ...settings, ...(next ?? {}) };
            Object.assign(element.style, settings.style ?? {});

            if (next && 'className' in next) {
                element.className = settings.className;
            }
        },
        options: () => ({ ...settings }),
        element: () => element,
        remove() {
            chart.unsubscribeCrosshairMove(update);
            element.remove();
        },
    };
}

/**
 * Fills the element, and says whether there was anything to show.
 *
 * @return {boolean}
 */
function render(element, chart, param, readings, settings) {
    if (typeof settings.formatter === 'function') {
        const content = settings.formatter({
            time: param.time,
            logical: param.logical,
            readings: readings.map((entry) => ({ series: entry.series, point: entry.point })),
            chart,
        });

        if (content === null || content === undefined) {
            return false;
        }

        if (content instanceof HTMLElement) {
            element.replaceChildren(content);

            return true;
        }

        element.textContent = String(content);

        return true;
    }

    element.replaceChildren();

    if (settings.showTime) {
        const heading = document.createElement('div');

        heading.textContent = formatTime(param.time);
        heading.style.cssText = 'opacity:0.6;font-size:11px;margin-bottom:3px';
        element.appendChild(heading);
    }

    for (const { series, point } of readings) {
        describe(element, series, point);
    }

    return true;
}

/**
 * The rows for one series, stacked.
 *
 * A candle carries four numbers and they belong under each other, not strung
 * along one line. Read down a column and the eye compares digits in the same
 * place; read along a row and it has to find each label first, on a line that
 * grows past the plot on any instrument quoted to more than two decimals.
 */
function describe(element, series, point) {
    const title = series.options().title;
    const format = (price) => (price === undefined || price === null
        ? '—'
        : series.priceFormatter().format(price));

    if (point.close === undefined) {
        element.appendChild(row(title, format(point.value)));

        return;
    }

    if (title) {
        const heading = document.createElement('div');

        heading.textContent = title;
        heading.style.cssText = 'font-weight:600;margin-bottom:2px';
        element.appendChild(heading);
    }

    element.appendChild(row('O', format(point.open)));
    element.appendChild(row('H', format(point.high)));
    element.appendChild(row('L', format(point.low)));
    element.appendChild(row('C', format(point.close)));
}

/**
 * A label and a number, the number pushed to the right.
 *
 * Right-aligned so the digits line up down the column even when the values
 * differ in length, which is the whole reason for stacking them.
 */
function row(label, value) {
    const line = document.createElement('div');

    line.style.cssText = 'display:flex;gap:14px;justify-content:space-between';

    const name = document.createElement('span');

    name.textContent = label ?? '';
    name.style.cssText = 'opacity:0.6';

    const number = document.createElement('span');

    number.textContent = value;
    number.style.cssText = 'font-variant-numeric:tabular-nums';

    line.appendChild(name);
    line.appendChild(number);

    return line;
}

/**
 * A date, or a date and time when the reading carries one.
 *
 * Deliberately plain. A caller who wants their own wording has `formatter`,
 * and guessing at a house style here would only be a thing to override.
 */
function formatTime(time) {
    if (typeof time === 'string') {
        return time;
    }

    if (typeof time === 'object' && time !== null) {
        return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
    }

    const date = new Date((time > 1e12 ? time : time * 1000));
    const midnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0;

    return midnight
        ? date.toISOString().slice(0, 10)
        : date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Puts the element where it can be read.
 *
 * Measured after the content is in, because a tooltip that flips based on its
 * previous size flips one frame late — which is exactly the frame the reader is
 * looking at it.
 */
function place(element, chart, param, position) {
    const host = chart.chartElement();
    const width = element.offsetWidth;
    const height = element.offsetHeight;

    if (position === 'top-left' || position === 'top-right') {
        element.style.top = `${EDGE}px`;
        element.style.left = position === 'top-left'
            ? `${EDGE}px`
            : `${Math.max(EDGE, host.clientWidth - width - EDGE)}px`;

        return;
    }

    // Flipped to the other side of the pointer near an edge rather than clamped
    // against it: a tooltip pinned to the edge sits on top of the very bars it
    // is describing.
    const overflowsRight = param.point.x + OFFSET + width > host.clientWidth - EDGE;
    const overflowsBottom = param.point.y + OFFSET + height > host.clientHeight - EDGE;

    const left = overflowsRight ? param.point.x - OFFSET - width : param.point.x + OFFSET;
    const top = overflowsBottom ? param.point.y - OFFSET - height : param.point.y + OFFSET;

    element.style.left = `${Math.max(EDGE, left)}px`;
    element.style.top = `${Math.max(EDGE, top)}px`;
}
