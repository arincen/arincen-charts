import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries, CandlestickSeries } from '../src/index.js';

/**
 * A chart that can be read without a pointer.
 *
 * To a screen reader a canvas is an empty box, and to anyone who cannot use a
 * mouse a crosshair is unreachable — which puts the prices out of reach, since
 * the crosshair is how a chart states a number.
 *
 * Everything here is invisible to a pointer user and changes nothing that is
 * drawn, which is also why it rots silently unless something checks it.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const points = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

const bars = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    open: 100 + index,
    high: 106 + index,
    low: 98 + index,
    close: 104 + index,
}));

function chartWith(data, definition = LineSeries, options = {}, chartOptions = {}) {
    const chart = createChart(container(), { width: 600, height: 300, ...chartOptions });
    const series = chart.addSeries(definition, options);

    series.setData(data);
    chart._internal.render();

    return { chart, series, element: chart.chartElement() };
}

/** What the live region currently holds. */
const announced = (element) => element.children
    .find((child) => child.getAttribute?.('aria-live'))
    ?.textContent ?? null;

const press = (element, key) => element.dispatch('keydown', { key });

test('the chart is reachable by keyboard and says what it is', () => {
    const { chart, element } = chartWith(points(30));

    assert.equal(element.tabIndex, 0, 'the chart cannot be tabbed to');
    assert.equal(element.getAttribute('role'), 'img');
    assert.ok(element.getAttribute('aria-label'), 'the chart has no label');

    chart.remove();
});

test('it is not role=application', () => {
    const { chart, element } = chartWith(points(30));

    // `application` tells a screen reader to hand every keystroke through and
    // stop offering its own navigation. That is a large promise to make on
    // behalf of a chart, and it takes the reader's own keys away.
    assert.notEqual(element.getAttribute('role'), 'application');

    chart.remove();
});

test('it carries a polite live region, not an assertive one', () => {
    const { chart, element } = chartWith(points(30));
    const live = element.children.find((child) => child.getAttribute?.('aria-live'));

    assert.ok(live, 'there is nothing for a screen reader to read');

    // Assertive interrupts whatever the reader is in the middle of, on every
    // keypress. A value only matters once they have stopped moving.
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.equal(live.getAttribute('aria-atomic'), 'true');

    chart.remove();
});

test('an arrow key moves the crosshair and announces the reading', () => {
    const { chart, element } = chartWith(points(30));

    press(element, 'ArrowLeft');

    assert.ok(chart._internal.crosshair, 'the crosshair did not move');

    const text = announced(element);

    assert.ok(text, 'nothing was announced');

    // A number and a date, not a particular number: pinning the value ties the
    // test to where the crosshair opens, which is a separate decision with its
    // own test below.
    assert.match(text, /\d/, `no figure in the announcement: "${text}"`);
    assert.match(text, /2024/, `no date in the announcement: "${text}"`);

    chart.remove();
});

test('the first press opens where it can be seen, not against the edge', () => {
    const { chart, element } = chartWith(points(200));

    press(element, 'ArrowLeft');

    const { from, to } = chart._internal.timeScale.visibleIndices();
    const at = chart._internal.crosshair.index;

    // Starting at the newest reading sounds right and puts the crosshair hard
    // against the right edge, half under the price axis, so the first press
    // looks like nothing happened. Which is how it was reported.
    assert.ok(at > from + 2 && at < to - 2, `opened at ${at}, at the edge of ${from}–${to}`);

    chart.remove();
});

test('Home and End still mean what they say on the first press', () => {
    const first = chartWith(points(200));

    press(first.element, 'Home');
    assert.equal(first.chart._internal.crosshair.index, 0);
    first.chart.remove();

    const last = chartWith(points(200));

    press(last.element, 'End');
    assert.equal(last.chart._internal.crosshair.index, 199);
    last.chart.remove();
});

test('left and right walk the readings one at a time', () => {
    const { chart, element } = chartWith(points(30));

    press(element, 'ArrowLeft');
    const first = chart._internal.crosshair.index;

    press(element, 'ArrowLeft');
    assert.equal(chart._internal.crosshair.index, first - 1);

    press(element, 'ArrowRight');
    assert.equal(chart._internal.crosshair.index, first);

    chart.remove();
});

test('Home and End reach the ends', () => {
    const { chart, element } = chartWith(points(30));

    press(element, 'Home');
    assert.equal(chart._internal.crosshair.index, 0);

    press(element, 'End');
    assert.equal(chart._internal.crosshair.index, 29);

    chart.remove();
});

test('it stops at the ends rather than running past them', () => {
    const { chart, element } = chartWith(points(10));

    press(element, 'Home');

    for (let count = 0; count < 5; count++) {
        press(element, 'ArrowLeft');
    }

    assert.equal(chart._internal.crosshair.index, 0, 'the crosshair walked off the start of the data');

    chart.remove();
});

test('Escape puts the crosshair away', () => {
    const { chart, element } = chartWith(points(30));

    press(element, 'ArrowLeft');
    assert.ok(chart._internal.crosshair);

    press(element, 'Escape');

    assert.equal(chart._internal.crosshair, null, 'the crosshair stayed after Escape');
    assert.ok(announced(element).length > 0, 'the reader was told nothing about it going');

    chart.remove();
});

test('leaving the chart puts the crosshair away too', () => {
    const { chart, element } = chartWith(points(30));

    press(element, 'ArrowLeft');
    element.dispatch('blur');

    assert.equal(chart._internal.crosshair, null, 'the crosshair outlived the focus');

    chart.remove();
});

test('keys the chart does not use are left to the page', () => {
    const { chart, element } = chartWith(points(30));

    let prevented = false;

    for (const handler of element.listeners.keydown ?? []) {
        handler({ key: 'Tab', preventDefault: () => { prevented = true; } });
    }

    // Swallowing everything takes the arrow keys away from a reader trying to
    // scroll the page past the chart, and Tab away from everyone.
    assert.equal(prevented, false, 'the chart swallowed a key it does not act on');

    chart.remove();
});

test('a candlestick is read out as four prices', () => {
    const { chart, element } = chartWith(bars(30), CandlestickSeries, { title: 'ARN' });

    press(element, 'End');

    const text = announced(element);

    for (const word of ['Open', 'high', 'low', 'close', 'ARN']) {
        assert.ok(text.includes(word), `"${word}" missing from "${text}"`);
    }

    chart.remove();
});

test('the live region is cleared before each announcement', () => {
    const { chart, element } = chartWith(
        Array.from({ length: 10 }, (_, index) => ({ time: start + index * day, value: 100 })),
    );

    const live = element.children.find((child) => child.getAttribute?.('aria-live'));
    const writes = [];

    // A real screen reader does not re-read text identical to what the region
    // already holds, and two readings running can be the same number — on a
    // flat stretch that reads as the keys having stopped working. Clearing
    // first is the fix, and no fake DOM can model the behaviour it works
    // around, so what is checked is that the technique is being used.
    let held = '';

    Object.defineProperty(live, 'textContent', {
        configurable: true,
        get: () => held,
        set: (value) => {
            held = String(value);
            writes.push(held);
        },
    });

    press(element, 'Home');
    press(element, 'ArrowRight');

    assert.equal(writes.length, 4, `expected a clear and a value per move, got ${writes.join(' | ')}`);
    assert.equal(writes[0], '', 'the region was not cleared before the first announcement');
    assert.equal(writes[2], '', 'the region was not cleared before the second announcement');
    assert.ok(writes[1].length > 0 && writes[3].length > 0, 'a move announced nothing');

    // Not asserted to be identical text: the announcement carries the date as
    // well as the price, so two readings of the same number differ anyway. The
    // clearing is the property under test, and it is the writes above that
    // show it.

    chart.remove();
});

test('it can be turned off where a chart is decoration', () => {
    const { chart, element } = chartWith(points(30), LineSeries, {}, { handleKeyboard: false });

    assert.notEqual(element.tabIndex, 0, 'a decorative chart is still a tab stop');
    assert.equal(
        element.children.find((child) => child.getAttribute?.('aria-live')),
        undefined,
        'a decorative chart still announces itself',
    );

    chart.remove();
});

test('removing the chart takes the listeners with it', () => {
    const { chart, element } = chartWith(points(30));

    chart.remove();

    assert.equal((element.listeners.keydown ?? []).length, 0, 'a keydown listener outlived the chart');
});
