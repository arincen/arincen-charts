import test from 'node:test';
import assert from 'node:assert/strict';
import { attributionStyle, ATTRIBUTION_URL } from '../src/mark.js';
import { chartDefaults } from '../src/options.js';

const layout = { fontFamily: 'Helvetica', textColor: '#191919' };

/**
 * Default on, and removable in one option. The licence asks for credit rather
 * than demanding it, and a mark that cannot be turned off is a mark that gets
 * the library rejected in review.
 */
test('the mark is on by default', () => {
    assert.equal(chartDefaults().layout.attributionLogo, true);
});

test('it anchors where the reader starts', () => {
    assert.match(attributionStyle(layout, 'en'), /left:8px/);
    assert.match(attributionStyle(layout, 'en-GB'), /left:8px/);
    assert.match(attributionStyle(layout, 'ar'), /right:8px/);
    assert.match(attributionStyle(layout, 'ar-SA'), /right:8px/);
    assert.match(attributionStyle(layout, 'he'), /right:8px/);
});

test('an unknown or missing language falls back to left', () => {
    for (const lang of ['', undefined, null, 'zz']) {
        assert.match(attributionStyle(layout, lang), /left:8px/);
    }
});

test('it never sets both sides, which would stretch it across the chart', () => {
    for (const lang of ['en', 'ar']) {
        const style = attributionStyle(layout, lang);

        assert.ok(! (/(^|;)left:/.test(style) && /(^|;)right:/.test(style)));
    }
});

test('it takes the chart s own type and colour rather than imposing its own', () => {
    const style = attributionStyle({ fontFamily: 'Georgia', textColor: '#abcdef' }, 'en');

    assert.match(style, /Georgia/);
    assert.match(style, /color:#abcdef/);
});

test('it is positioned absolutely, so it cannot push the chart around', () => {
    assert.match(attributionStyle(layout, 'en'), /position:absolute/);
});

/* ------------------------------------------------------------ where it goes */

/**
 * The badge is the only marketing this library does, and until it was tagged
 * its traffic was indistinguishable from every other visit to that page — so
 * the question "is the badge worth keeping on by default" had no evidence
 * behind it either way.
 */
test('the mark links to a page on our own site, over https', () => {
    const url = new URL(ATTRIBUTION_URL);

    assert.equal(url.protocol, 'https:');
    assert.match(url.hostname, /arincen\.com$/);
    // The home page rather than the library's own: a click from somebody
    // else's chart is a stranger meeting the company, and the charts page is
    // one link away from there.
    assert.equal(url.pathname, '/');
});

test('and carries a campaign parameter, so the traffic can be counted', () => {
    assert.equal(new URL(ATTRIBUTION_URL).searchParams.get('utm_source'), 'chart-badge');
});

test('one parameter, not three — this string ships in a bundle measured to the byte', () => {
    // The full utm_source/medium/campaign triple put the light build over its
    // ceiling by twenty-one bytes. Every tool attributes on the source alone.
    assert.equal([...new URL(ATTRIBUTION_URL).searchParams].length, 1);
});

test('the parameters are plain utm keys, which every analytics tool reads', () => {
    // Not a scheme of our own: a reader can see what is being tracked and
    // strip it, and no tool needs configuring to receive it.
    for (const [key] of new URL(ATTRIBUTION_URL).searchParams) {
        assert.match(key, /^utm_/, `${key} is not a utm parameter`);
    }
});

/* --------------------------------------------------------- clear of the axis */

/**
 * The mark used to sit six pixels off the bottom edge, which is inside the
 * strip the time labels are drawn in — so on any chart with a visible time
 * axis, the first date was painted straight through it. Found by looking at a
 * demo of somebody else's page, which is the only place the default
 * configuration gets looked at.
 */
test('it sits above the time axis, not in it', async () => {
    const { container } = await import('./support/headless-dom.js');
    const { createChart, LineSeries } = await import('../src/index.js');

    const chart = createChart(container(), { width: 600, height: 300 });

    chart.addSeries(LineSeries, {}).setData([
        { time: '2024-01-01', value: 100 },
        { time: '2024-01-02', value: 101 },
    ]);

    chart._internal.render();

    const bottom = Number(/bottom:(\d+)px/.exec(chart._internal.attributionMark.style.cssText)[1]);
    const axisHeight = chart._internal.height - chart._internal.plot.bottom;

    assert.ok(axisHeight > 6, 'this chart has no time axis to clear');
    assert.ok(bottom >= axisHeight, `the mark sits at ${bottom}px, inside a ${axisHeight}px axis`);
});

test('and returns to the edge when there is no axis to clear', async () => {
    const { container } = await import('./support/headless-dom.js');
    const { createChart, LineSeries } = await import('../src/index.js');

    const chart = createChart(container(), {
        width: 600,
        height: 300,
        timeScale: { visible: false },
    });

    chart.addSeries(LineSeries, {}).setData([{ time: '2024-01-01', value: 100 }]);
    chart._internal.render();

    // A sparkline has no axis, and a mark floating twenty pixels up in an
    // empty corner would look like a mistake.
    assert.match(chart._internal.attributionMark.style.cssText, /bottom:6px/);
});
