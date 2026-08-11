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

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Where the mark sends a reader who follows it.
 *
 * Exported so the page it names can be asserted to exist. A wordmark on every
 * chart we draw, pointing at a 404, would be worse than no mark at all.
 *
 * The campaign parameter is the point of the exercise: without it the badge's
 * traffic is indistinguishable from every other visit to that page, and any
 * argument about whether the badge earns its place is instinct against
 * instinct. One plain `utm_source` rather than the usual three — every
 * analytics tool attributes on that alone, and this string is carried in a
 * bundle measured to the byte.
 *
 * Twenty-one bytes gzipped, as it happens. The full triple put the light
 * build over its ceiling.
 */
/**
 * The mark itself, as path data.
 *
 * Built with `createElementNS` rather than assigned as `innerHTML`: an
 * application running under Trusted Types refuses an HTML string outright,
 * and a charting library is not worth a CSP exception.
 */
const ICON_PATHS = [
    'M190.72,9.9c-5.04-1.67-40.36-13.11-47.08,23.32c-0.45,2.42-0.52,4.13-0.44,5.32c0.06,0.92,1.25,1.24,1.77,0.48c5.43-7.88,13.61-16.99,24.5-21.58c0.33-0.14,0.59,0.3,0.31,0.52c-4.26,3.22-14.84,12.01-22.53,24.98c-0.3,0.5-0.1,1.15,0.42,1.41c2.9,1.46,12.03,4.55,16.96-0.95c6.99-7.8,13.15-31.08,26.1-33.22c0.05-0.01,0.07-0.07,0.07-0.13C190.81,9.99,190.78,9.92,190.72,9.9z',
    'M149.32,64.21c-0.97-7.59-3.84-14.55-7.03-20.28c0,0,0-0.01,0.01-0.01l-0.45-0.77c-0.2-0.34-0.39-0.68-0.59-1.01c-0.04-0.06-0.07-0.12-0.11-0.18c-0.42-0.7-0.84-1.39-1.26-2.04c-5.56-9.33-13.3-17.2-22.55-22.88c0,0,0,0,0,0c0,0-0.01-0.01-0.02-0.01c-0.01-0.01-0.03-0.02-0.04-0.03c0,0,0,0,0,0c-0.63-0.37-4-2.23-4-2.23c-1.59-0.84-3.22-1.61-4.89-2.31c-0.05-0.02-1-0.36-1.05-0.38c0,0-3.66-1.25-6.07-2.06c-1.1-0.37-2.28,0.27-2.57,1.4l-5.41,21.08c-0.26,1,0.29,2.03,1.26,2.38c1.58,0.56,3.81,1.38,4.87,1.87c0.04,0.02,2.85,1.41,4.02,2.11l1.21,0.76c10.67,6.91,17.94,18.63,18.7,32.07c-0.03,0-0.05-0.01-0.08-0.01c0.05,0.87,0.08,1.63,0.08,2.35c0,0.07,0,0.14,0,0.21v3.24v55.09v6.04c0,1.1,0.9,2,2,2h21.88c1.1,0,2-0.9,2-2v-18.45v-5.44l0.02,0.01V74.11c0-0.03,0-0.06,0-0.09c0-0.03,0-0.05,0-0.08v-9.39L149.32,64.21z',
    'M82.29,7.14c-29.79,0-55.02,19.49-63.65,46.42c-0.11,0.33-0.41,0.55-0.75,0.55l-11.61,0c-0.41,0-0.77,0.25-0.92,0.63L2.23,66.96c-0.24,0.64,0.23,1.33,0.92,1.33h11.72c0.46,0,0.83,0.39,0.79,0.86c-0.12,1.59-0.19,3.2-0.19,4.82c0,2.58,0.16,5.12,0.45,7.62c0.05,0.47-0.31,0.89-0.79,0.89h-5.9c-0.4,0-0.76,0.24-0.91,0.62L5.21,95.29c-0.26,0.64,0.22,1.34,0.91,1.34l12.75,0c0.33,0,0.63,0.21,0.74,0.52c9.43,25.47,33.93,43.62,62.68,43.62c13,0,23.8-3.73,34.03-10.15c0.58-0.37,0.93-1.01,0.93-1.7v-29.1c0-1.94-2.46-2.73-3.61-1.17c-7.31,9.89-18.02,16.29-31.35,16.29c-13.67,0-25.8-6.73-33.25-17.05c-0.38-0.52,0.01-1.26,0.66-1.26l4.46,0.05c0.91,0,1.71-0.62,1.94-1.5l2.66-10.24c0.33-1.27-0.63-2.5-1.94-2.5l-13.96,0.01c-0.38,0-0.72-0.27-0.79-0.65c-0.5-2.54-0.76-5.17-0.76-7.86c0-1.68,0.11-3.34,0.31-4.97c0.05-0.4,0.39-0.7,0.8-0.7l19.48-0.02c0.62,0,1.18-0.38,1.4-0.96l2.88-11.15c0.38-0.98-0.35-2.04-1.4-2.04H47.83c-0.62,0-1.01-0.67-0.69-1.2c7.17-11.93,20.21-20.04,35.12-20.04c0.88,0,2.01,0.05,2.93,0.1c0.95,0.06,1.81-0.57,2.05-1.5l5.46-21.27c0.3-1.17-0.5-2.33-1.7-2.49C88.14,7.34,85.24,7.14,82.29,7.14z',
];

export const ATTRIBUTION_URL = 'https://en.arincen.com/arincen-charts?utm_source=chart-badge';

/**
 * The mark's inline style, split out from the DOM work so the placement rule
 * can be tested without a browser.
 *
 * Every value is inline because a published library cannot assume the page it
 * lands on has any particular stylesheet, and must not add one.
 *
 * @param {Object} layout the chart's layout options
 * @param {string} [lang] the document language
 * @param {number} [offset] how far above the bottom edge to sit
 * @return {string}
 */
export function attributionStyle(layout, lang, offset = 6) {
    // Anchored to whichever side the reader's language starts from, so the
    // mark never lands where the eye begins.
    const side = RTL.test(lang || '') ? 'right' : 'left';

    return [
        'position:absolute',
        `bottom:${Math.max(6, offset)}px`,
        `${side}:8px`,
        'z-index:2',
        'display:flex',
        'align-items:center',
        'gap:4px',
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
 * Moves an existing mark clear of the time axis.
 *
 * The mark used to sit six pixels off the bottom, which is inside the strip
 * the time labels are drawn in — so on any chart with a visible time axis the
 * first date was painted straight through it. It sits above the axis now, and
 * follows it: the axis appears, disappears and changes height as options and
 * fonts change.
 *
 * @param {HTMLAnchorElement|null} mark
 * @param {Object} layout
 * @param {number} offset
 */
export function placeAttributionMark(mark, layout, offset) {
    if (mark) {
        mark.style.cssText = attributionStyle(
            layout,
            typeof document === 'undefined' ? '' : document.documentElement.lang,
            offset,
        );
    }
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

    // The mark itself, rather than its name alone. Inline because a published
    // library must not make a page fetch anything from us in order to draw a
    // chart.
    const svg = document.createElementNS(SVG_NS, 'svg');

    svg.setAttribute('viewBox', '0 0 195 150');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'height:1.05em;width:auto;display:block';

    for (const data of ICON_PATHS) {
        const path = document.createElementNS(SVG_NS, 'path');

        path.setAttribute('d', data);
        svg.appendChild(path);
    }

    link.appendChild(svg);
    link.appendChild(document.createTextNode('Arincen Charts'));

    link.style.cssText = attributionStyle(
        layout,
        typeof document === 'undefined' ? '' : document.documentElement.lang,
    );

    link.addEventListener('mouseenter', () => { link.style.opacity = '0.9'; });
    link.addEventListener('mouseleave', () => { link.style.opacity = '0.45'; });

    container.appendChild(link);

    return link;
}
