import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart } from '../src/index.js';
import { palette, preferredTheme } from '../src/theme.js';

/**
 * Two palettes, so a dark chart is one option rather than nine.
 *
 * The nine are spread across five branches of the options tree, and the one
 * almost everybody misses is the crosshair's *label background*: left dark
 * under a dark theme it becomes dark text on a dark tag, and the price under
 * the pointer is exactly the number the reader was reaching for.
 */

const build = (options) => createChart(container(), { width: 600, height: 300, ...options });

test('a dark chart is one option', () => {
    const chart = build({ theme: 'dark' });
    const options = chart.options();

    assert.equal(options.layout.background.color, '#0a0a0a');
    assert.notEqual(options.layout.textColor, '#0a0a0a');
    assert.equal(options.grid.vertLines.color, '#262626');
    assert.equal(options.timeScale.borderColor, '#262626');

    chart.remove();
});

test('the crosshair label inverts, or the price becomes unreadable', () => {
    const light = build({ theme: 'light' });
    const dark = build({ theme: 'dark' });

    const labelOf = (chart) => chart.options().crosshair.vertLine.labelBackgroundColor;

    assert.notEqual(
        labelOf(light),
        labelOf(dark),
        'the label background is the same in both themes, so one of them is unreadable',
    );

    // Specifically: dark theme, light tag.
    assert.match(labelOf(dark), /^#f/i, `a dark theme kept a ${labelOf(dark)} label`);

    light.remove();
    dark.remove();
});

test('the caller outranks the theme', () => {
    const chart = build({ theme: 'dark', grid: { vertLines: { color: '#ff0000' } } });

    // Applied under the caller's options rather than over them. Over, and a
    // theme silently discards what was written beside it — which is the failure
    // that makes people give up on a theme option and set nine colours by hand.
    assert.equal(chart.options().grid.vertLines.color, '#ff0000');

    // And the rest of the palette is still there.
    assert.equal(chart.options().layout.background.color, '#0a0a0a');

    chart.remove();
});

test('a theme applied later reaches the same values', () => {
    const chart = build();

    assert.equal(chart.options().layout.background.color, '#ffffff');

    chart.applyOptions({ theme: 'dark' });

    assert.equal(chart.options().layout.background.color, '#0a0a0a');

    chart.remove();
});

test('switching back is a switch, not a one-way door', () => {
    const chart = build({ theme: 'dark' });

    chart.applyOptions({ theme: 'light' });

    assert.equal(chart.options().layout.background.color, '#ffffff');
    assert.equal(chart.options().grid.vertLines.color, '#e5e5e5');

    chart.remove();
});

test('options passed with the theme in one call still win', () => {
    const chart = build();

    chart.applyOptions({ theme: 'dark', layout: { textColor: '#00ff00' } });

    assert.equal(chart.options().layout.textColor, '#00ff00');
    assert.equal(chart.options().layout.background.color, '#0a0a0a');

    chart.remove();
});

test('a name that means nothing changes nothing', () => {
    const chart = build({ theme: 'midnight' });

    // Not an error: a typo in a colour scheme should not take the chart down,
    // and there is nothing sensible to fall back to other than what was there.
    assert.equal(chart.options().layout.background.color, '#ffffff');

    chart.remove();
});

test('no theme leaves the built-in values alone', () => {
    const chart = build();

    assert.equal(chart.options().theme, null);
    assert.equal(chart.options().layout.background.color, '#ffffff');

    chart.remove();
});

/* -------------------------------------------------------------------- auto */

test('auto resolves to a real palette', () => {
    const resolved = palette('auto');

    assert.ok(resolved, 'auto resolved to nothing');
    assert.ok(
        resolved === palette('light') || resolved === palette('dark'),
        'auto produced a palette that is neither',
    );
});

test('auto falls back to light where nothing can be asked', () => {
    const media = globalThis.matchMedia;

    delete globalThis.matchMedia;

    try {
        // A server render, an old browser, a test runner. A chart that cannot
        // ask should not guess dark and hand back white-on-white.
        assert.equal(preferredTheme(), 'light');
        assert.equal(palette('auto'), palette('light'));
    } finally {
        globalThis.matchMedia = media;
    }
});

test('an auto chart follows the system when it changes', () => {
    const listeners = [];

    globalThis.matchMedia = () => ({
        matches: false,
        addEventListener: (type, handler) => listeners.push(handler),
        removeEventListener: () => {},
    });

    const chart = build({ theme: 'auto' });

    assert.equal(chart.options().layout.background.color, '#ffffff');
    assert.equal(listeners.length, 1, 'an auto chart is not listening to the system');

    // The reader switches their OS to dark with the chart on screen.
    globalThis.matchMedia = () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
    });

    listeners[0]();

    assert.equal(chart.options().layout.background.color, '#0a0a0a');

    chart.remove();
    delete globalThis.matchMedia;
});

test('a chart moved off auto stops following the system', () => {
    let removed = 0;

    globalThis.matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => { removed++; },
    });

    const chart = build({ theme: 'auto' });

    chart.applyOptions({ theme: 'dark' });

    assert.equal(removed, 1, 'the chart is still listening to a setting it no longer follows');

    chart.remove();
    delete globalThis.matchMedia;
});

test('removing an auto chart stops it listening', () => {
    let removed = 0;

    globalThis.matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => { removed++; },
    });

    const chart = build({ theme: 'auto' });

    chart.remove();

    assert.equal(removed, 1, 'a removed chart is still listening to the system theme');

    delete globalThis.matchMedia;
});
