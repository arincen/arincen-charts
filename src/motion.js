/**
 * Whether the reader has asked for less movement.
 *
 * A chart has two things that move without being touched: the ring that pulses
 * on the last price, and the glide that carries a flicked chart on after the
 * finger has left. Both are decoration on top of information that is already
 * there, which is precisely the category `prefers-reduced-motion` exists for —
 * for a reader with vestibular sensitivity the pulse is not a nice touch, it is
 * a small thing moving in their peripheral vision for as long as the page is
 * open.
 *
 * Asked at the moment it matters rather than cached, because a reader can
 * change the setting with the chart on screen and the next frame should already
 * be still.
 */
export function prefersReducedMotion() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}
