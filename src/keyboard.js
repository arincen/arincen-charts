import { formatCrosshairTime } from './time.js';

/**
 * Reaching a chart without a pointer.
 *
 * The library this API is modelled on has nothing here: its charts cannot be
 * focused, cannot be moved through with a keyboard, and announce nothing. To a
 * reader using a screen reader a canvas is an empty box, and to anyone who
 * cannot use a mouse a crosshair is unreachable — which means the prices are
 * unreachable, because the crosshair is how a chart states a number.
 *
 * So: the chart takes focus, arrow keys walk the readings, and each one is
 * announced as text. None of it is visible to a pointer user and none of it
 * changes what is drawn.
 *
 * Deliberately not `role="application"`. That tells a screen reader to hand
 * every keystroke through and stop offering its own navigation, which is a
 * large promise to make on behalf of a chart. `role="img"` with a label and a
 * live region keeps the reader's own keys working and still says what is here.
 */

/** Keys that move by one reading, and by ten. */
const STEP = 1;
const PAGE = 10;

const HIDDEN = [
    'position:absolute',
    'width:1px',
    'height:1px',
    'margin:-1px',
    'padding:0',
    'overflow:hidden',
    'clip:rect(0 0 0 0)',
    'white-space:nowrap',
    'border:0',
].join(';');

/**
 * @param {Object} chart the internal chart instance
 * @return {{destroy: Function, announce: Function}}
 */
export function attachKeyboard(chart) {
    const element = chart.element;

    element.tabIndex = 0;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', 'Price chart. Use the arrow keys to read values.');

    // Assertive would interrupt whatever the reader is in the middle of on
    // every keypress; polite queues behind it, which is what a value that only
    // matters once the reader has stopped moving wants.
    const live = document.createElement('div');

    // A screen reader announces in the language of the text it is given, and
    // the direction tells it which that is when the reading mixes a name with
    // digits.
    live.setAttribute('dir', chart.textDirection());
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.style.cssText = HIDDEN;
    element.appendChild(live);

    /** Where the keyboard is, independent of where a pointer last was. */
    let cursor = null;

    const announce = (text) => {
        // Cleared first: a live region does not re-announce text identical to
        // what it already holds, and two readings in a row can be the same
        // number — on a flat stretch that reads as the keys having stopped.
        live.textContent = '';
        live.textContent = text;
    };

    const place = (index) => {
        const count = chart.timeIndex.length;

        if (! count) {
            return;
        }

        cursor = Math.max(0, Math.min(count - 1, index));

        const pane = chart.panes[0];
        const series = pane.series.find((candidate) => candidate.byIndex[cursor]);
        const point = series?.byIndex[cursor];

        if (! point) {
            return;
        }

        const value = point.close === undefined ? point.value : point.close;

        chart.crosshair = {
            index: cursor,
            y: series.scale.priceScale.priceToY(value),
            x: chart.timeScale.indexToX(cursor),
            pane,
        };

        chart.drawCrosshair();
        chart.emitCrosshair(cursor, { x: chart.crosshair.x, y: chart.crosshair.y }, null);
        announce(describe(chart, series, point));
    };

    /**
     * Where the crosshair appears on the first press.
     *
     * The middle of what is on screen, not the newest reading. Starting at the
     * newest sounds right and puts the crosshair hard against the right edge,
     * half under the price axis — so the first press looks like nothing
     * happened, which is exactly how it was reported.
     */
    const opening = () => {
        const { from, to } = chart.timeScale.visibleIndices();

        return Math.max(0, Math.min(chart.timeIndex.length - 1, Math.round((from + to) / 2)));
    };

    const onKeyDown = (event) => {
        const count = chart.timeIndex.length;

        if (! count) {
            return;
        }

        const from = cursor ?? count - 1;
        const moves = {
            ArrowRight: from + STEP,
            ArrowLeft: from - STEP,
            PageUp: from + PAGE,
            PageDown: from - PAGE,
            Home: 0,
            End: count - 1,
        };

        if (event.key === 'Escape') {
            cursor = null;
            chart.clearCrosshair();
            announce('Crosshair cleared.');

            return;
        }

        if (! (event.key in moves)) {
            return;
        }

        // Only for keys we act on. Swallowing everything would take the arrow
        // keys away from a reader trying to scroll the page past the chart.
        event.preventDefault();

        // A relative key with nowhere to move from opens in the middle rather
        // than stepping off the newest reading. Home and End are absolute and
        // mean what they say whether or not the crosshair is up.
        const absolute = event.key === 'Home' || event.key === 'End';

        place(cursor === null && ! absolute ? opening() : moves[event.key]);
    };

    const onBlur = () => {
        cursor = null;
        chart.clearCrosshair();
    };

    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('blur', onBlur);

    return {
        announce,
        destroy() {
            element.removeEventListener('keydown', onKeyDown);
            element.removeEventListener('blur', onBlur);
            live.remove();
        },
    };
}

/**
 * What a reading sounds like when it is read aloud rather than looked at.
 *
 * Through the series' public surface, because that is where the formatter
 * lives — the internal object holds options as a plain field and has no
 * formatter at all, so reaching for `series.options()` on it throws.
 *
 * The date is formatted rather than passed through. A UNIX timestamp read out
 * as sixteen digits is worse than saying nothing.
 */
function describe(chart, series, point) {
    const api = series.api;
    const format = (price) => api.priceFormatter().format(price);
    const title = api.options().title;
    const when = formatCrosshairTime(point.time, {
        locale: chart.options.localization.locale,
        intraday: chart.options.timeScale.timeVisible,
    });

    if (point.close !== undefined) {
        return `${title ? `${title}. ` : ''}${when}. `
            + `Open ${format(point.open)}, high ${format(point.high)}, `
            + `low ${format(point.low)}, close ${format(point.close)}.`;
    }

    return `${title ? `${title}. ` : ''}${when}. ${format(point.value)}.`;
}
