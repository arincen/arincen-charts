import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';
import { createTooltip } from '../src/tooltip.js';
import { isRightToLeft } from '../src/options.js';

/**
 * Reading a chart right to left.
 *
 * Most of this is *not* mirroring. Time runs left to right in every locale, and
 * a reversed axis would put the newest bar where a reader of any language looks
 * for the oldest — the direction of a time series is not a property of the
 * language describing it. What does follow the locale is text: canvas reorders
 * a run of Arabic on its own but places the run according to `direction`, so a
 * label mixing a month name with digits comes out with its parts in the right
 * order and the whole thing anchored to the wrong end.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

const build = (locale) => createChart(container(), {
    width: 600,
    height: 300,
    localization: locale ? { locale } : {},
});

/** The `direction` in force when the chart drew its text. */
function directionUsed(chart) {
    let direction = null;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'direction') {
                direction = value;
            }

            return true;
        },
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return direction;
}

/* ------------------------------------------------------------- the locales */

test('the right-to-left languages are recognised by their language subtag', () => {
    for (const locale of ['ar', 'ar-SA', 'he', 'fa-IR', 'ur', 'AR']) {
        assert.equal(isRightToLeft(locale), true, `${locale} was read as left to right`);
    }

    for (const locale of ['en', 'en-GB', 'fr', 'de-DE', 'ja', '', null, undefined]) {
        assert.equal(isRightToLeft(locale), false, `${locale} was read as right to left`);
    }
});

/* ---------------------------------------------------------------- the canvas */

test('the canvas is told which way the text runs', () => {
    const arabic = build('ar');
    const english = build();

    arabic.addSeries(LineSeries, {}).setData(points(30));
    english.addSeries(LineSeries, {}).setData(points(30));

    assert.equal(directionUsed(arabic), 'rtl');
    assert.equal(directionUsed(english), 'ltr');

    arabic.remove();
    english.remove();
});

test('the direction is set before anything measures text', () => {
    const chart = build('ar');
    const order = [];

    const recording = new Proxy({
        measureText: (text) => {
            order.push('measure');

            return { width: String(text).length * 7 };
        },
        createLinearGradient: () => ({ addColorStop() {} }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'direction') {
                order.push(`direction:${value}`);
            }

            return true;
        },
    });

    chart.addSeries(LineSeries, {}).setData(points(30));
    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    // `measureText` reads `direction` too, so a width taken under the wrong
    // one lays out the very label it was measured for.
    assert.equal(order[0], 'direction:rtl', `the first thing done was ${order[0]}`);

    chart.remove();
});

/* -------------------------------------------------------------- the plot */

test('the plot is never mirrored', () => {
    const chart = build('ar');
    const series = chart.addSeries(LineSeries, {});

    series.setData(points(30));
    chart.timeScale().fitContent();
    chart._internal.render();

    const scale = chart._internal.timeScale;

    // Time runs left to right in every locale. A reversed axis would put the
    // newest bar where a reader of any language looks for the oldest.
    assert.ok(
        scale.indexToX(0) < scale.indexToX(29),
        'the time scale was reversed for an Arabic locale',
    );

    chart.remove();
});

/* ---------------------------------------------------------------- the DOM */

test('the tooltip takes its direction from the chart, not the page', () => {
    const arabic = build('ar');
    const english = build();

    // A chart set to Arabic inside an English page should still read as
    // Arabic — the tooltip is the chart's text, not the document's.
    assert.equal(createTooltip(arabic).element().getAttribute('dir'), 'rtl');
    assert.equal(createTooltip(english).element().getAttribute('dir'), 'ltr');

    arabic.remove();
    english.remove();
});

test('the live region is marked too', () => {
    const chart = build('ar');
    const live = chart.chartElement().children.find((child) => child.getAttribute?.('aria-live'));

    assert.ok(live, 'there is no live region to mark');
    assert.equal(live.getAttribute('dir'), 'rtl');

    chart.remove();
});
