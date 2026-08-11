import './support/full-build.js';
import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, LineSeries } from '../src/full.js';
import { outsideSession, toMinutes } from '../src/sessions.js';

/**
 * The hours the market was shut.
 *
 * An index scale runs its bars end to end, so an overnight gap looks exactly
 * like a lunch hour looks exactly like a fast half-hour. On a five-day
 * intraday chart there is nothing to say where one day ended.
 *
 * The hours come from the caller. Shipping a table of exchange hours means
 * owning every holiday, half-day and DST change on every exchange for ever;
 * `timeZone` is handed to the platform's own database, which is already on the
 * machine and already right.
 */

const hour = 60 * 60;

/** Bars every half hour through a given UTC day. */
const halfHourly = (year, month, day, count = 48) => Array.from(
    { length: count },
    (_, index) => ({ time: Math.floor(Date.UTC(year, month, day) / 1000) + index * 1800, value: 100 + index }),
);

const at = (year, month, day, hours, minutes = 0) => Math.floor(
    Date.UTC(year, month, day, hours, minutes) / 1000,
);

const newYork = { from: '09:30', to: '16:00', timeZone: 'America/New_York' };

/* ------------------------------------------------------------- reading times */

test('a time of day is read from hh:mm, or from minutes', () => {
    assert.equal(toMinutes('09:30'), 570);
    assert.equal(toMinutes('00:00'), 0);
    assert.equal(toMinutes('23:59'), 1439);
    assert.equal(toMinutes(570), 570);
});

test('a time that is not a time is refused rather than guessed at', () => {
    for (const bad of ['9.30', '25:00', '09:60', 'morning', '', null, undefined, {}]) {
        assert.equal(toMinutes(bad), null, `${JSON.stringify(bad)} was read as a time`);
    }
});

test('a session that cannot be read shades nothing', () => {
    // Better than shading everything, which is what a null start would do if
    // it were treated as midnight.
    assert.deepEqual(outsideSession([at(2024, 0, 2, 15)], { from: 'lunch', to: '16:00' }), []);
});

/* ---------------------------------------------------------------- the clock */

test('the hours are read in the market timezone, not the reader time', () => {
    const stamps = [12, 13, 14, 15, 20, 21, 22].map((utc) => at(2024, 0, 2, utc, 30));
    const closed = outsideSession(stamps, newYork);

    // 14:30 UTC is 09:30 in New York in January; 21:30 UTC is 16:30.
    assert.deepEqual(closed, [true, true, false, false, false, true, true]);
});

test('and summer time is the platform own business, not ours', () => {
    // July: New York is UTC-4, so the open is 13:30 UTC rather than 14:30. A
    // fixed offset would shade the first hour of every summer day.
    assert.equal(outsideSession([at(2024, 6, 2, 13, 30)], newYork)[0], false);
    assert.equal(outsideSession([at(2024, 6, 2, 12, 30)], newYork)[0], true);
});

test('without a timezone the times are read as UTC', () => {
    const closed = outsideSession(
        [at(2024, 0, 2, 8), at(2024, 0, 2, 12)],
        { from: '09:30', to: '16:00' },
    );

    assert.deepEqual(closed, [true, false]);
});

/* ----------------------------------------------------------------- the days */

test('a weekend is shut whatever the hour', () => {
    // 2024-01-06 is a Saturday, mid-session by the clock.
    assert.equal(outsideSession([at(2024, 0, 6, 15)], newYork)[0], true);
});

test('the trading days can be said, for a market that is not Monday to Friday', () => {
    // Tadawul runs Sunday to Thursday.
    const saudi = { from: '10:00', to: '15:00', days: [0, 1, 2, 3, 4], timeZone: 'Asia/Riyadh' };

    assert.equal(outsideSession([at(2024, 0, 7, 9)], saudi)[0], false, 'Sunday was treated as a weekend');
    assert.equal(outsideSession([at(2024, 0, 5, 9)], saudi)[0], true, 'Friday was treated as a trading day');
});

test('a session running through midnight is not read as an empty one', () => {
    // Sydney, and most of what trades overnight: 22:00 to 07:00.
    const overnight = { from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] };

    assert.equal(outsideSession([at(2024, 0, 2, 23)], overnight)[0], false, '23:00 was called shut');
    assert.equal(outsideSession([at(2024, 0, 2, 3)], overnight)[0], false, '03:00 was called shut');
    assert.equal(outsideSession([at(2024, 0, 2, 12)], overnight)[0], true, 'midday was called open');
});

/* --------------------------------------------------------------- the drawing */

/** Every rectangle painted, with the colour in force. */
function fills(chart) {
    const drawn = [];

    let fillStyle = null;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect: (x, y, width, height) => drawn.push({ x, y, width, height, fillStyle }),
    }, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            if (key === 'fillStyle') {
                fillStyle = value;
            }

            return true;
        },
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return drawn;
}

function intraday(options = {}) {
    const chart = createChart(container(), {
        width: 800,
        height: 300,
        timeScale: { timeVisible: true },
        ...options,
    });

    chart.addSeries(LineSeries, {}).setData(halfHourly(2024, 0, 2));
    chart.timeScale().fitContent();
    chart._internal.render();

    return chart;
}

const shading = (chart, colour) => fills(chart).filter((fill) => fill.fillStyle === colour);

test('nothing is shaded until a session is given', () => {
    const chart = intraday();

    assert.deepEqual(shading(chart, 'rgba(127, 127, 127, 0.06)'), []);

    chart.remove();
});

test('the closed hours are shaded', () => {
    const chart = intraday({ sessions: { ...newYork, color: 'rgba(1, 2, 3, 0.05)' } });
    const painted = shading(chart, 'rgba(1, 2, 3, 0.05)');

    assert.ok(painted.length > 0, 'a chart of one day shaded none of its night');

    for (const fill of painted) {
        assert.equal(fill.y, chart._internal.plot.top);
        assert.equal(fill.height, chart._internal.plot.bottom - chart._internal.plot.top);
    }

    chart.remove();
});

test('consecutive closed bars are one rectangle, not one each', () => {
    const chart = intraday({ sessions: { ...newYork, color: 'rgba(1, 2, 3, 0.05)' } });
    const painted = shading(chart, 'rgba(1, 2, 3, 0.05)');

    // A translucent colour drawn twice over the same pixel is twice as dark,
    // so per-bar fills band every seam. One day has two closed stretches: the
    // hours before the open and the hours after the close.
    assert.ok(painted.length <= 2, `${painted.length} rectangles for two closed stretches`);

    chart.remove();
});

test('the shading stays inside the plot', () => {
    const chart = intraday({ sessions: { ...newYork, color: 'rgba(1, 2, 3, 0.05)' } });
    const plot = chart._internal.plot;

    for (const fill of shading(chart, 'rgba(1, 2, 3, 0.05)')) {
        assert.ok(fill.x >= plot.left - 0.01, `a band starts at ${fill.x}, left of the plot`);
        assert.ok(fill.x + fill.width <= plot.right + 0.01, 'a band runs under the price axis');
    }

    chart.remove();
});

test('the answer is worked out once, not once a frame', () => {
    const chart = intraday({ sessions: newYork });
    const first = chart._internal.sessions.closed;

    chart._internal.render();
    chart._internal.render();

    // An `Intl` call on every visible bar, sixty times a second, is the
    // difference between this being free and it being the reason a chart
    // stutters.
    assert.equal(chart._internal.sessions.closed, first, 'the session was recomputed');

    chart.remove();
});

test('but it is worked out again when the data changes', () => {
    const chart = intraday({ sessions: newYork });
    const first = chart._internal.sessions.closed;

    chart._internal.allSeries[0].api.setData(halfHourly(2024, 6, 2));
    chart._internal.render();

    assert.notEqual(chart._internal.sessions.closed, first, 'yesterday session was kept for new data');

    chart.remove();
});

test('and again when the session itself changes', () => {
    const chart = intraday({ sessions: newYork });
    const first = chart._internal.sessions.closed;

    chart.applyOptions({ sessions: { ...newYork, from: '08:00' } });
    chart._internal.render();

    assert.notEqual(chart._internal.sessions.closed, first, 'the old hours were kept');

    chart.remove();
});
