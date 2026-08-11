/**
 * Telling you about a failure the chart itself survived.
 *
 * A chart draws sixty times a second from objects it did not write: your
 * primitives, your custom series, your autoscale provider. One of them
 * throwing must not take the chart down — a broken indicator should cost its
 * own drawing and nothing else, and that bargain is not up for renegotiation.
 *
 * The mistake was making that bargain *quietly*. Every one of those failures
 * was caught and dropped, so a plugin author whose `draw` threw on the first
 * frame saw a chart with their plugin missing, no error, and nothing to search
 * for. The library knew exactly what went wrong and said nothing.
 *
 * So: same swallowing, no more silence. `onError` is notification, never
 * control flow — returning from it cannot make the chart retry, and throwing
 * from it is ignored.
 */

/**
 * Says something about the data once per chart, to the console.
 *
 * Deliberately not `onError`. That is for a throw in code the chart called on
 * your behalf, and a handler wired to an error service should not start
 * receiving "your feed is out of order" — a warning routed to a pager is a
 * warning everybody learns to ignore.
 *
 * @param {Object|null|undefined} chart
 * @param {string} message
 */
export function warn(chart, message) {
    if (! chart) {
        return;
    }

    const seen = chart.reportedErrors ??= new Set();

    if (seen.has(message)) {
        return;
    }

    seen.add(message);

    globalThis.console?.warn?.(`[arincen-charts] ${message}`);
}

/**
 * Reports once per unique failure per chart.
 *
 * Deduplicated because these live inside the render loop: a primitive that
 * throws while drawing throws again on the next frame, and a chart that a
 * reader leaves open would otherwise report the same broken plugin sixty times
 * a second, to the console or to whatever error service is listening.
 *
 * @param {Object|null|undefined} chart the chart record, not the public api
 * @param {unknown} error whatever was thrown, which need not be an Error
 * @param {string} source what was being asked for, e.g. `primitive.draw`
 */
export function report(chart, error, source) {
    if (! chart) {
        return;
    }

    const seen = chart.reportedErrors ??= new Set();

    // The message rather than the object: a primitive throwing a fresh Error
    // each frame is one fault, not sixty a second.
    const key = `${source}:${error instanceof Error ? error.message : String(error)}`;

    if (seen.has(key)) {
        return;
    }

    seen.add(key);

    const handler = chart.options?.onError;

    if (typeof handler === 'function') {
        try {
            handler(error, source);
        } catch {
            // A reporting handler that throws would otherwise take down the
            // render it was reporting on — the one place a failure really
            // cannot be allowed to cascade.
        }

        return;
    }

    // No handler: say it anyway. Silence was the defect.
    globalThis.console?.error?.(`[arincen-charts] ${source} threw`, error);
}
