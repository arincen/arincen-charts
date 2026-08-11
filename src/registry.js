/**
 * Every live chart on the page, findable by something that did not build it.
 *
 * `toText` and `annotate` only help a caller who already has the chart object,
 * which means a page that was written to cooperate. The interesting case is the
 * other one: a browser agent, an extension, a test harness or a screen-reader
 * tool arriving at a page it did not write, needing to find the chart before it
 * can ask anything about it. Their alternative is to read pixels.
 *
 * So a chart puts itself on `window.arincenCharts` and takes itself off again
 * when it is removed. It is an array, in creation order, holding the same
 * public API objects the page has — nothing is exposed here that a script on
 * the page could not already reach through the DOM.
 *
 *     const [chart] = window.arincenCharts;
 *
 *     chart.toText();
 *     chart.annotate([{ price: 148, text: 'resistance' }]);
 *
 * `window` is checked rather than assumed: this runs during server-side
 * rendering too, where there is no window and a chart is built to be
 * serialised.
 */

const KEY = 'arincenCharts';

export function register(api) {
    if (typeof window === 'undefined') {
        return;
    }

    (window[KEY] ??= []).push(api);
}

export function unregister(api) {
    if (typeof window === 'undefined' || ! window[KEY]) {
        return;
    }

    const at = window[KEY].indexOf(api);

    if (at !== -1) {
        window[KEY].splice(at, 1);
    }
}
