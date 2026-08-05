/**
 * Touch behaviour the light build does not carry.
 *
 * Both of these are free functions called from behind `FULL_BUILD`, for the
 * usual reason: a method body always ships however it is flagged, where an
 * unreferenced function is deleted outright.
 */

/** How far above the finger the crosshair sits, so the reading is not covered. */
const TRACKING_OFFSET = 44;

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
