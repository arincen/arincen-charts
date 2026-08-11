import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/index.js';

/**
 * What a chart says when it has nothing to draw.
 *
 * It used to say `0.00, 0.20, 0.40, 0.60, 0.80, 1.00` — a full price axis over
 * a grid, with nothing to indicate the numbers were invented. On a financial
 * chart that is not an empty state; it is a chart stating prices it does not
 * have, and every consumer sees it for the length of their first fetch.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

/** Every string the chart paints. */
function textDrawn(chart) {
    const seen = [];

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillText: (text) => seen.push(String(text)),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return seen;
}

const build = (options) => createChart(container(), { width: 600, height: 300, ...options });

test('an empty chart does not label an axis it has no data for', () => {
    const chart = build();

    const text = textDrawn(chart);
    const numbers = text.filter((entry) => /^\d/.test(entry));

    assert.deepEqual(numbers, [], `an empty chart printed prices: ${numbers.join(', ')}`);

    chart.remove();
});

test('a series with no readings is the same as no series', () => {
    const chart = build();

    chart.addSeries(LineSeries, {}).setData([]);

    const numbers = textDrawn(chart).filter((entry) => /^\d/.test(entry));

    assert.deepEqual(numbers, [], `an emptied chart printed prices: ${numbers.join(', ')}`);

    chart.remove();
});

test('it says so instead', () => {
    const chart = build();

    assert.ok(textDrawn(chart).includes('No data'), 'an empty chart said nothing at all');

    chart.remove();
});

test('loading wins over empty', () => {
    const chart = build({ loading: true });

    const text = textDrawn(chart);

    // Without this a chart flashes "No data" on its way to having some, which
    // reads as a failure that then corrects itself.
    assert.ok(text.includes('Loading…'), 'a loading chart did not say so');
    assert.ok(! text.includes('No data'), 'a loading chart also claimed to have none');

    chart.remove();
});

test('the message can be turned off', () => {
    const chart = build({ localization: { emptyText: null } });

    assert.deepEqual(textDrawn(chart), [], 'something was still drawn');

    chart.remove();
});

test('the message is translatable', () => {
    const chart = build({ localization: { emptyText: 'لا توجد بيانات' } });

    assert.ok(textDrawn(chart).includes('لا توجد بيانات'));

    chart.remove();
});

test('a chart with data says nothing about being empty', () => {
    const chart = build();

    chart.addSeries(LineSeries, {}).setData([
        { time: start, value: 100 },
        { time: start + day, value: 104 },
    ]);

    const text = textDrawn(chart);

    assert.ok(! text.includes('No data'), 'a chart with readings claimed to be empty');
    assert.ok(text.some((entry) => entry.includes('100')), 'the axis lost its labels');

    chart.remove();
});

test('loading does not blank a chart that already has data', () => {
    const chart = build({ loading: true });

    // Loading more history is the common case, and hiding what is already
    // drawn to say so would be a worse chart than the one it replaced.
    chart.addSeries(LineSeries, {}).setData([
        { time: start, value: 100 },
        { time: start + day, value: 104 },
    ]);

    const text = textDrawn(chart);

    assert.ok(! text.includes('Loading…'), 'a chart with data was covered by a loading message');
    assert.ok(text.some((entry) => entry.includes('100')), 'the data stopped being drawn');

    chart.remove();
});

test('the axis comes back when data arrives', () => {
    const chart = build();
    const series = chart.addSeries(LineSeries, {});

    assert.deepEqual(textDrawn(chart).filter((entry) => /^\d/.test(entry)), []);

    series.setData([{ time: start, value: 100 }, { time: start + day, value: 104 }]);

    assert.ok(
        textDrawn(chart).some((entry) => /^\d/.test(entry)),
        'the axis stayed silent after the data arrived',
    );

    chart.remove();
});
