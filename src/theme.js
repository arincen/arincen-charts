/**
 * Two palettes, so a dark chart is one option rather than nine.
 *
 * Making a chart dark by hand means finding `layout.background`,
 * `layout.textColor`, both grid colours, both crosshair colours, both crosshair
 * *label background* colours, and the two axis borders — across five branches of
 * the options tree. Every consumer rediscovers that list, and the one almost
 * everybody misses is the label background: leave it dark and the price under
 * the pointer becomes dark text on a dark tag, which is the number they were
 * reaching for.
 *
 * Applied under the caller's own options rather than over them, so
 * `{ theme: 'dark', grid: { vertLines: { visible: false } } }` means what it
 * looks like it means.
 *
 * Only two, and no way to register a third. A palette is a product decision,
 * and a library that accepts arbitrary ones ends up owning everyone's taste —
 * anything beyond light and dark is better expressed as the options it would
 * have set anyway.
 */

const LIGHT = {
    layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#0a0a0a' },
    grid: {
        vertLines: { color: '#e5e5e5' },
        horzLines: { color: '#e5e5e5' },
    },
    crosshair: {
        vertLine: { color: '#737373', labelBackgroundColor: '#0a0a0a' },
        horzLine: { color: '#737373', labelBackgroundColor: '#0a0a0a' },
    },
    rightPriceScale: { borderColor: '#e5e5e5' },
    leftPriceScale: { borderColor: '#e5e5e5' },
    timeScale: { borderColor: '#e5e5e5' },
};

const DARK = {
    layout: { background: { type: 'solid', color: '#0a0a0a' }, textColor: '#a3a3a3' },
    grid: {
        vertLines: { color: '#262626' },
        horzLines: { color: '#262626' },
    },
    crosshair: {
        // Inverted, and this is the one that catches people: a dark tag under a
        // dark theme is dark text on dark, and the price under the pointer is
        // exactly the number the reader came for.
        vertLine: { color: '#525252', labelBackgroundColor: '#fafafa' },
        horzLine: { color: '#525252', labelBackgroundColor: '#fafafa' },
    },
    rightPriceScale: { borderColor: '#262626' },
    leftPriceScale: { borderColor: '#262626' },
    timeScale: { borderColor: '#262626' },
};

const PALETTES = { light: LIGHT, dark: DARK };

/**
 * What the reader's own system is asking for.
 *
 * Falls back to light where the query is unavailable — a server render, an old
 * browser, a test — because a chart that cannot ask should not guess dark.
 */
export function preferredTheme() {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

/**
 * The palette for a theme name, or null when the name means nothing.
 *
 * `'auto'` resolves against the system at the moment it is asked, which is why
 * this is a function rather than a table lookup at the call site: a chart built
 * before the reader switched their system should still be able to catch up.
 *
 * @param {string} name
 * @return {Object|null}
 */
export function palette(name) {
    if (name === 'auto') {
        return PALETTES[preferredTheme()];
    }

    return PALETTES[name] ?? null;
}

/**
 * Watches the system setting, for a chart set to `'auto'`.
 *
 * @param {Function} onChange
 * @return {Function} stops watching
 */
export function watchPreferred(onChange) {
    const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

    if (! query?.addEventListener) {
        return () => {};
    }

    const handler = () => onChange(preferredTheme());

    query.addEventListener('change', handler);

    return () => query.removeEventListener('change', handler);
}
