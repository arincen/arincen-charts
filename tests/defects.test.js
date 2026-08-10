import './support/full-build.js';
import { container, renderCounting } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChart, CandlestickSeries } from '../src/index.js';
import { CandlestickSeries as Definition } from '../src/series.js';
import { normalisePoint } from '../src/series.js';

/**
 * Four things their API declares that ours accepted and then ignored, or
 * promised and then did not keep. None is a missing feature; each is a defect
 * with our name on it, which is why they were done ahead of the rest.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const bars = (count) => Array.from({ length: count }, (_, index) => ({
    time: start + index * day,
    open: 100,
    high: 102,
    low: 98,
    close: 101,
}));

/* -------------------------------------- destroy, on a custom series */

function countingPaneView() {
    const state = { destroyed: 0 };

    return {
        state,
        destroy() {
            state.destroyed++;
        },
        renderer: () => ({ draw() {} }),
        update() {},
        priceValueBuilder: (item) => [item.value ?? 0],
        defaultOptions: () => ({}),
    };
}

/**
 * A custom series is somebody else's object and may hold a cache, an offscreen
 * canvas or a worker. We tell it when it arrives and never told it when it
 * went, so anything it allocated stayed allocated.
 */
test('removing a custom series tells it to clean up', () => {
    const chart = createChart(container(), { width: 800, height: 400 });
    const view = countingPaneView();
    const series = chart.addCustomSeries(view, {});

    series.setData([{ time: start, value: 1 }]);
    chart.removeSeries(series);

    assert.equal(view.state.destroyed, 1, 'the custom series was dropped without being told');
});

test('removing the whole chart tells every custom series too', () => {
    const chart = createChart(container(), { width: 800, height: 400 });
    const first = countingPaneView();
    const second = countingPaneView();

    chart.addCustomSeries(first, {}).setData([{ time: start, value: 1 }]);
    chart.addCustomSeries(second, {}).setData([{ time: start, value: 1 }]);
    chart.remove();

    assert.equal(first.state.destroyed, 1, 'the first was leaked');
    assert.equal(second.state.destroyed, 1, 'the second was leaked');
});

test('a custom series that throws while cleaning up does not take the chart with it', () => {
    const chart = createChart(container(), { width: 800, height: 400 });
    const series = chart.addCustomSeries({
        destroy() {
            throw new Error('no');
        },
        renderer: () => ({ draw() {} }),
        update() {},
        priceValueBuilder: () => [0],
        defaultOptions: () => ({}),
    }, {});

    series.setData([{ time: start, value: 1 }]);
    chart.removeSeries(series);
});

/**
 * Primitives are detached on the way out for the same reason: `detached` is
 * the other half of `attached`, and a plugin holding a subscription would
 * otherwise keep it.
 */
test('removing a series detaches its primitives', () => {
    const chart = createChart(container(), { width: 800, height: 400 });
    const series = chart.addSeries(CandlestickSeries, {});
    let detached = 0;

    series.setData(bars(10));
    series.attachPrimitive({ attached() {}, detached() { detached++; } });
    chart.removeSeries(series);

    assert.equal(detached, 1, 'a primitive was left attached to a series that no longer exists');
});

/* ------------------------------------ tickVisible, on an axis view */

function axisViewPrimitive(tickVisible) {
    return {
        priceAxisViews: () => [{
            coordinate: () => 100,
            text: () => '42',
            textColor: () => '#000',
            backColor: () => '#fff',
            ...(tickVisible === undefined ? {} : { tickVisible: () => tickVisible }),
        }],
    };
}

/**
 * Documented on their axis view and accepted by ours since the day primitives
 * landed, while doing nothing at all. A plugin author who sets a field and
 * sees no change has been told a lie about the contract.
 */
test('a primitive axis view can refuse its tick mark', () => {
    const draw = (tickVisible) => {
        const chart = createChart(container(), { width: 800, height: 400 });
        const series = chart.addSeries(CandlestickSeries, {});

        series.setData(bars(10));
        series.attachPrimitive(axisViewPrimitive(tickVisible));

        return renderCounting(chart);
    };

    assert.ok(draw(true) > draw(false), 'asking for the tick drew no more than refusing it');
});

test('an axis view that says nothing about the tick gets one', () => {
    const draw = (tickVisible) => {
        const chart = createChart(container(), { width: 800, height: 400 });
        const series = chart.addSeries(CandlestickSeries, {});

        series.setData(bars(10));
        series.attachPrimitive(axisViewPrimitive(tickVisible));

        return renderCounting(chart);
    };

    assert.equal(draw(undefined), draw(true), 'the default was not to draw one');
});

/* ------------------------------------------------- allowBoldLabels */

/**
 * Watched at `fillText`, not at every assignment to `font`. Tick candidates are
 * deliberately *measured* in bold whatever happens — the wider measurement
 * keeps the collision test on the safe side — so a test that watched font
 * assignments would see bold either way and prove nothing.
 */
test('the lead time label can be asked not to be bold', () => {
    const drewBold = (allowBoldLabels) => {
        let font = '';
        let bold = false;

        const chart = createChart(container(), {
            width: 800,
            height: 400,
            timeScale: { allowBoldLabels },
        });

        chart.addSeries(CandlestickSeries, {}).setData(bars(400));
        chart.timeScale().fitContent();

        const inner = chart._internal;
        const recording = new Proxy({
            measureText: (text) => ({ width: String(text).length * 7 }),
            createLinearGradient: () => ({ addColorStop() {} }),
            fillText: () => {
                bold = bold || font.startsWith('bold');
            },
        }, {
            get: (target, key) => (key in target ? target[key] : () => {}),
            set: (target, key, value) => {
                if (key === 'font') {
                    font = String(value);
                }

                return true;
            },
        });

        inner.mainCtx = recording;
        inner.overlayCtx = recording;
        inner.render();

        return bold;
    };

    assert.equal(drewBold(true), true, 'nothing was drawn in bold by default');
    assert.equal(drewBold(false), false, 'the axis went on bolding after being told not to');
});

/* ------------------------------------------------ per-candle colours */

/**
 * One candle marked out from the rest, without drawing a second series on top
 * of the first.
 */
test('a single reading can carry its own body, outline and wick colours', () => {
    const point = normalisePoint(
        { time: start, open: 1, high: 2, low: 0, close: 1.5, color: '#111', borderColor: '#222', wickColor: '#333' },
        start,
    );

    assert.equal(point.color, '#111');
    assert.equal(point.borderColor, '#222');
    assert.equal(point.wickColor, '#333');
});

test('a reading without them falls back to the series options', () => {
    const point = normalisePoint({ time: start, open: 1, high: 2, low: 0, close: 1.5 }, start);

    assert.equal(point.color, undefined);
    assert.equal(point.borderColor, undefined);
    assert.equal(point.wickColor, undefined);
});

test('the overrides reach the canvas', () => {
    const painted = [];
    const ctx = new Proxy({}, {
        get: (target, key) => (key === 'fillRect' || key === 'strokeRect' ? () => {} : () => {}),
        set: (target, key, value) => {
            if (key === 'fillStyle' || key === 'strokeStyle') {
                painted.push(value);
            }

            return true;
        },
    });

    Definition.draw(ctx, {
        series: { byIndex: [normalisePoint({ time: start, open: 1, high: 3, low: 0, close: 2, color: '#aa0000', borderColor: '#00bb00', wickColor: '#0000cc' }, start)] },
        options: Definition.defaults(),
        priceScale: { priceToY: (price) => 400 - price * 50 },
        timeScale: { barSpacing: 40, indexToX: () => 100 },
        plot: { left: 0, top: 0, right: 800, bottom: 400 },
        pixelRatio: 2,
        from: 0,
        to: 0,
    });

    for (const colour of ['#0000cc', '#00bb00', '#aa0000']) {
        assert.ok(painted.includes(colour), `${colour} never reached the canvas: ${painted.join(', ')}`);
    }
});
