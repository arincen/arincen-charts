import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries, CandlestickSeries } from '../src/index.js';
import { createTooltip } from '../src/tooltip.js';

/**
 * The tooltip nobody should have to write again.
 *
 * Every application using a library without one writes the same thirty lines,
 * and the two things almost all of them get wrong are here as tests: the
 * pointer-left case, which leaves a stale value frozen on screen, and the edge
 * flip, without which the tooltip runs off the side of the chart it belongs to.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count, offset = 0) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + offset + index,
}));

const bars = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    open: 100 + index,
    high: 106 + index,
    low: 98 + index,
    close: 104 + index,
}));

function chartWith(data, definition = LineSeries, options = {}) {
    const chart = createChart(container(), { width: 600, height: 300 });
    const series = chart.addSeries(definition, options);

    series.setData(data);
    chart._internal.render();

    return { chart, series };
}

/**
 * Puts the pointer over a bar, through the handler a real pointer reaches.
 *
 * Not `setCrosshairPosition`: that one deliberately does not notify
 * subscribers, because notifying is what makes two synchronised charts set each
 * other's crosshair forever. And not `emitCrosshair` on its own either — that
 * fires the handlers without leaving a crosshair behind, so the leave handler
 * finds nothing to clear and returns before telling anyone. Which is a fair
 * description of what a hand-written tooltip gets wrong, and not something a
 * test should reproduce in order to pass.
 */
function hover(chart, series, index) {
    const x = chart._internal.timeScale.indexToX(index);

    chart._internal.handlePointerMove({ clientX: x, clientY: 120 });

    return index;
}

test('the tooltip appears with the reading under the pointer', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart);

    hover(chart, series, 10);

    assert.equal(tip.element().style.display, 'block');
    assert.ok(tip.element().textContent.includes('110'), `nothing recognisable in "${tip.element().textContent}"`);

    chart.remove();
});

test('it hides when the pointer leaves, rather than freezing the last value', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart);

    hover(chart, series, 10);
    assert.equal(tip.element().style.display, 'block');

    // The single commonest bug in a hand-written tooltip: the handler fires
    // with no time when the pointer goes, and code that only looks at
    // `seriesData` leaves the last reading on screen for good.
    chart._internal.handlePointerLeave();

    assert.equal(tip.element().style.display, 'none', 'the tooltip kept a value after the pointer had gone');

    chart.remove();
});

test('it lives inside the chart element and leaves with it', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart);

    assert.equal(tip.element().parentNode, chart.chartElement());

    hover(chart, series, 5);
    tip.remove();

    assert.equal(tip.element().parentNode, null, 'the element outlived the tooltip that made it');

    chart.remove();
});

test('removing it also drops its subscription', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart);
    const element = tip.element();

    tip.remove();
    hover(chart, series, 10);

    assert.equal(element.style.display, 'none', 'a removed tooltip is still listening');

    chart.remove();
});

test('a candlestick reports all four prices, one to a line', () => {
    const { chart, series } = chartWith(bars(30), CandlestickSeries, { title: 'ARN' });
    const tip = createTooltip(chart);

    hover(chart, series, 10);

    const text = tip.element().textContent;

    for (const label of ['O', 'H', 'L', 'C']) {
        assert.ok(text.includes(label), `no ${label} in "${text}"`);
    }

    // Stacked, not strung along one line. Four numbers on a row means the eye
    // has to find each label before it can read the value, and the row grows
    // past the plot on anything quoted to more than two decimals.
    const rows = tip.element().children.filter(
        (child) => child.style.display === 'flex',
    );

    assert.equal(rows.length, 4, `expected four rows, found ${rows.length}`);

    chart.remove();
});

test('the numbers are pushed to the right so they line up', () => {
    const { chart, series } = chartWith(bars(30), CandlestickSeries);
    const tip = createTooltip(chart);

    hover(chart, series, 10);

    for (const child of tip.element().children.filter((node) => node.style.display === 'flex')) {
        assert.equal(child.children.length, 2, 'a row is not a label and a value');
        assert.match(child.style.cssText ?? '', /space-between/);
    }

    chart.remove();
});

test('a series title is used when it has one', () => {
    const { chart, series } = chartWith(points(30), LineSeries, { title: 'ARN' });
    const tip = createTooltip(chart);

    hover(chart, series, 10);

    assert.ok(tip.element().textContent.includes('ARN'), 'the series title is missing');

    chart.remove();
});

/* ------------------------------------------------------------- formatting */

test('a formatter returning a string is set as text, never as markup', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart, {
        formatter: () => '<img src=x onerror="stolen()">',
    });

    hover(chart, series, 10);

    // A formatter is handed values from a data feed. A feed that can put markup
    // on the page is a feed that can put a script on it.
    assert.equal(tip.element().children.length, 0, "the formatter string was parsed as HTML");
    assert.ok(tip.element().textContent.includes('<img'), 'the markup was not shown as text');

    chart.remove();
});

test('a formatter returning null hides the tooltip', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart, { formatter: () => null });

    hover(chart, series, 10);

    assert.equal(tip.element().style.display, 'none');

    chart.remove();
});

test('a formatter is given the readings and the chart', () => {
    const { chart, series } = chartWith(points(30));
    let seen = null;

    const tip = createTooltip(chart, {
        formatter: (payload) => {
            seen = payload;

            return 'x';
        },
    });

    hover(chart, series, 10);

    assert.ok(seen, 'the formatter was never called');
    assert.equal(seen.chart, chart);
    assert.equal(seen.readings.length, 1);
    assert.equal(seen.readings[0].series, series);

    chart.remove();
});

/* -------------------------------------------------------------- placement */

test('it flips to the other side of the pointer near the right edge', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart);

    // The fake container reports 1500px whatever the chart was built at, so
    // without this the pointer never comes near an edge and the flip is never
    // reached — the test passed against a version with no flip at all.
    chart.chartElement().clientWidth = 600;
    chart.chartElement().clientHeight = 300;

    tip.element().offsetWidth = 180;
    tip.element().offsetHeight = 60;

    chart.timeScale().fitContent();
    chart._internal.render();
    chart._internal.handlePointerMove({ clientX: chart._internal.plot.right - 4, clientY: 120 });

    const left = parseFloat(tip.element().style.left);

    assert.ok(
        left + 180 <= chart.chartElement().clientWidth,
        `the tooltip runs off the right edge: left ${left} + 180 against ${chart.chartElement().clientWidth}`,
    );

    // And it is genuinely on the other side of the pointer, not merely clamped
    // against the edge — clamping leaves it sitting on the bars it describes.
    assert.ok(left < chart._internal.plot.right - 4, 'the tooltip was clamped rather than flipped');

    chart.remove();
});

test('pinned to a corner it does not follow the pointer', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart, { position: 'top-left' });

    hover(chart, series, 5);
    const first = tip.element().style.left;

    hover(chart, series, 25);

    assert.equal(tip.element().style.left, first, 'a pinned tooltip moved with the pointer');

    chart.remove();
});

/* ----------------------------------------------------------------- options */

test('visible false keeps it out of the way without removing it', () => {
    const { chart, series } = chartWith(points(30));
    const tip = createTooltip(chart, { visible: false });

    hover(chart, series, 10);
    assert.equal(tip.element().style.display, 'none');

    tip.applyOptions({ visible: true });
    hover(chart, series, 10);

    assert.equal(tip.element().style.display, 'block');

    chart.remove();
});

test('it reports only the series it was told to', () => {
    const chart = createChart(container(), { width: 600, height: 300 });
    const first = chart.addSeries(LineSeries, { title: 'first' });
    const second = chart.addSeries(LineSeries, { title: 'second' });

    first.setData(points(30));
    second.setData(points(30, 40));
    chart._internal.render();

    const tip = createTooltip(chart, { series: [second] });

    chart._internal.handlePointerMove({ clientX: chart._internal.timeScale.indexToX(10), clientY: 120 });

    const text = tip.element().textContent;

    assert.ok(text.includes('second'), 'the requested series is missing');
    assert.ok(! text.includes('first'), 'a series that was not asked for was reported');

    chart.remove();
});
