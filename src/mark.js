/**
 * The attribution mark.
 *
 * A real anchor element laid over the canvas, because a canvas cannot hold a
 * link: everything drawn on it is pixels, so a logo painted there would be an
 * image of a link rather than one you can follow, and a screen reader would
 * find nothing at all.
 *
 * Text rather than the logo. The brand SVG is fifteen kilobytes — larger than
 * this entire library — and inlining it would undo the one claim the library
 * makes about itself. A wordmark costs a few dozen bytes and says the same
 * thing.
 *
 * It is default-on and removable in a single option, which is a deliberate
 * position rather than a weak one: the licence asks for credit and does not
 * demand it, and a mark that cannot be turned off is a mark that gets the
 * library rejected in review.
 */

const RTL = /^(ar|he|fa|ur)/i;

/**
 * Where the mark sends a reader who follows it.
 *
 * Exported so the page it names can be asserted to exist. A wordmark on every
 * chart we draw, pointing at a 404, would be worse than no mark at all.
 */
export const ATTRIBUTION_URL = 'https://en.arincen.com/arincen-charts';

/**
 * The mark's inline style, split out from the DOM work so the placement rule
 * can be tested without a browser.
 *
 * Every value is inline because a published library cannot assume the page it
 * lands on has any particular stylesheet, and must not add one.
 *
 * @param {Object} layout the chart's layout options
 * @param {string} [lang] the document language
 * @return {string}
 */
export function attributionStyle(layout, lang) {
    // Anchored to whichever side the reader's language starts from, so the
    // mark never lands where the eye begins.
    const side = RTL.test(lang || '') ? 'right' : 'left';

    return [
        'position:absolute',
        'bottom:6px',
        `${side}:8px`,
        'z-index:2',
        `font:500 11px/1 ${layout.fontFamily}`,
        `color:${layout.textColor}`,
        'opacity:0.45',
        'text-decoration:none',
        'letter-spacing:0.01em',
        'pointer-events:auto',
        'transition:opacity .2s',
    ].join(';');
}

/**
 * @param {HTMLElement} container the chart's own element, which is positioned
 * @param {Object} layout the chart's layout options
 * @return {HTMLAnchorElement}
 */
export function createAttributionMark(container, layout) {
    const link = document.createElement('a');

    link.href = ATTRIBUTION_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.dir = 'ltr';
    link.textContent = 'Arincen Charts';

    link.style.cssText = attributionStyle(
        layout,
        typeof document === 'undefined' ? '' : document.documentElement.lang,
    );

    link.addEventListener('mouseenter', () => { link.style.opacity = '0.9'; });
    link.addEventListener('mouseleave', () => { link.style.opacity = '0.45'; });

    container.appendChild(link);

    return link;
}
