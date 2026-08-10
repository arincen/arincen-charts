/**
 * Touch behaviour.
 *
 * Free functions rather than methods, for the usual reason: a method body
 * always ships however it is flagged, where an unreferenced function is
 * deleted outright. Kinetic scrolling stays behind `FULL_BUILD`; the crosshair
 * does not, because a chart you cannot read a price off with your thumb is not
 * much of a chart on a phone — and the phone is where most of ours are read.
 */

/** How far above the finger the crosshair sits, so the reading is not covered. */
const TRACKING_OFFSET = 44;

/** How long a finger must stay put before it is a press rather than a scroll. */
const LONG_PRESS_MS = 400;

/** How far it may drift in that time and still count as staying put. */
const LONG_PRESS_SLOP = 8;

/**
 * Recognises a press-and-hold, and gives up the moment the finger travels.
 *
 * A hold has to be told apart from a scroll, and the only thing separating
 * them at the instant the finger lands is what happens next — so the decision
 * is deferred, and abandoned as soon as the finger moves far enough to have
 * meant a scroll all along. The slop is there because no thumb is still.
 *
 * The clock is injectable so the rule can be tested without waiting out a real
 * four hundred milliseconds, and without a fake timer library.
 *
 * @param {Function} onHold called with the point held, once
 * @param {{delay: number, slop: number, schedule: Function, cancel: Function}} [clock]
 * @return {{start: Function, move: Function, cancel: Function, pending: Function}}
 */
export function createLongPress(onHold, clock = {}) {
    const {
        delay = LONG_PRESS_MS,
        slop = LONG_PRESS_SLOP,
        schedule = setTimeout,
        cancel = clearTimeout,
    } = clock;

    let timer = null;
    let origin = null;

    const stop = () => {
        if (timer !== null) {
            cancel(timer);
            timer = null;
        }

        origin = null;
    };

    return {
        start(point) {
            stop();
            origin = point;
            timer = schedule(() => {
                const held = origin;

                timer = null;
                origin = null;
                onHold(held);
            }, delay);
        },

        move(point) {
            if (timer === null || ! origin) {
                return;
            }

            if (Math.hypot(point.x - origin.x, point.y - origin.y) > slop) {
                stop();
            }
        },

        cancel: stop,
        pending: () => timer !== null,
    };
}

/** Below this speed a flick has stopped and the animation ends. */
const KINETIC_MIN_SPEED = 0.02;

/** Fraction of speed kept per frame. */
const KINETIC_DECAY = 0.92;

/** A flick faster than this is clamped, so a stray fast swipe cannot bolt. */
const KINETIC_MAX_SPEED = 4;

/**
 * Where the crosshair should sit for a touch.
 *
 * Offset upward rather than placed under the finger: a crosshair you are
 * covering with your hand tells you nothing, which is the whole reason
 * tracking mode exists separately from the mouse behaviour.
 *
 * @param {Touch} touch
 * @param {DOMRect} rect
 * @return {{x: number, y: number}}
 */
export function trackingPoint(touch, rect) {
    return {
        x: touch.clientX - rect.left,
        y: Math.max(0, touch.clientY - rect.top - TRACKING_OFFSET),
    };
}

/**
 * Carries on a flick after the finger has left, decaying to a stop.
 *
 * @param {Object} chart
 * @param {number} speed pixels per frame at release
 * @return {Function} cancels the animation
 */
export function startKineticScroll(chart, speed) {
    let velocity = Math.max(-KINETIC_MAX_SPEED, Math.min(KINETIC_MAX_SPEED, speed));
    let handle = null;

    const step = () => {
        velocity *= KINETIC_DECAY;

        if (Math.abs(velocity) < KINETIC_MIN_SPEED || chart.removed) {
            handle = null;

            return;
        }

        chart.scrollBy(velocity);
        handle = requestAnimationFrame(step);
    };

    handle = requestAnimationFrame(step);

    return () => {
        if (handle !== null) {
            cancelAnimationFrame(handle);
            handle = null;
        }
    };
}
