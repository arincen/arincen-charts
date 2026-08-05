import test from 'node:test';
import assert from 'node:assert/strict';
import { toTimestamp, tickWeight, TickWeight } from '../src/time.js';
import { normalisePoint } from '../src/series.js';
import { nearestIndex } from '../src/markers.js';

const utc = (year, month, day, hour = 0) => Date.UTC(year, month - 1, day, hour) / 1000;

test('the time shapes the site actually sends all parse', () => {
    assert.equal(toTimestamp(utc(2026, 3, 1)), utc(2026, 3, 1));
    assert.equal(toTimestamp('2026-03-01'), utc(2026, 3, 1));
    assert.equal(toTimestamp({ year: 2026, month: 3, day: 1 }), utc(2026, 3, 1));
});

test('a business-day object and its string spelling agree', () => {
    assert.equal(toTimestamp({ year: 2026, month: 3, day: 1 }), toTimestamp('2026-03-01'));
});

test('unparseable times are rejected rather than turned into 1970', () => {
    for (const value of [null, undefined, '', 'not a date', {}, Number.NaN]) {
        assert.equal(toTimestamp(value), null, `${JSON.stringify(value)} should not parse`);
    }
});

test('a day boundary outweighs an hour', () => {
    const midnight = utc(2026, 3, 2);
    const previous = utc(2026, 3, 1, 23);

    assert.ok(tickWeight(midnight, previous) >= TickWeight.Day);
});

test('a month boundary outweighs a day', () => {
    const first = utc(2026, 4, 1);
    const previous = utc(2026, 3, 31);

    assert.ok(tickWeight(first, previous) > TickWeight.Day);
});

test('a year boundary outweighs a month', () => {
    const newYear = utc(2026, 1, 1);
    const previous = utc(2025, 12, 31);

    assert.ok(tickWeight(newYear, previous) >= TickWeight.Year);
});

test('an intraday step stays below day weight', () => {
    const noon = utc(2026, 3, 2, 12);
    const previous = utc(2026, 3, 2, 11);

    assert.ok(tickWeight(noon, previous) < TickWeight.Day);
});

/**
 * A point carrying a time but no value is whitespace: it holds its slot on the
 * axis and breaks the line rather than being bridged over.
 */
test('a point with no value normalises to whitespace', () => {
    const point = normalisePoint({ time: '2026-03-01' }, utc(2026, 3, 1));

    assert.equal(point.value, null);
    assert.equal(point.ts, utc(2026, 3, 1));
});

test('a bar keeps every price it was given', () => {
    const point = normalisePoint({ time: 1, open: 1, high: 4, low: 0.5, close: 3 }, 1);

    assert.equal(point.open, 1);
    assert.equal(point.high, 4);
    assert.equal(point.low, 0.5);
    assert.equal(point.close, 3);
    assert.equal(point.value, 3, 'a bar reports its close as its value');
});

test('the caller gets its own time object back untouched', () => {
    const original = { year: 2026, month: 3, day: 1 };
    const point = normalisePoint({ time: original, value: 5 }, utc(2026, 3, 1));

    assert.equal(point.time, original);
});

test('a marker snaps to the nearest bar, not the nearest earlier bar', () => {
    const index = [utc(2026, 3, 1), utc(2026, 3, 5), utc(2026, 3, 9)];

    assert.equal(nearestIndex(index, utc(2026, 3, 1)), 0);
    assert.equal(nearestIndex(index, utc(2026, 3, 4)), 1);
    assert.equal(nearestIndex(index, utc(2026, 3, 8)), 2);
    assert.equal(nearestIndex(index, utc(2026, 1, 1)), 0, 'before the data, clamp to the first bar');
    assert.equal(nearestIndex(index, utc(2027, 1, 1)), 2, 'after the data, clamp to the last bar');
});
