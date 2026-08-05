import test from 'node:test';
import assert from 'node:assert/strict';
import { customSeriesDefinition } from '../src/custom-series.js';

/**
 * A pane view that records what the chart asked of it instead of drawing.
 */
function recordingView(overrides = {}) {
    const calls = { update: [], renderer: 0, draw: [] };

    return {
        calls,
        priceValueBuilder: (row) => row.values ?? [],
        isWhitespace: (row) => ! row.values,
        defaultOptions: () => ({ colour: 'red' }),
        update(data, options) {
            calls.update.push({ data, options });
        },
        renderer() {
            calls.renderer++;

            return {
                draw(target, priceToCoordinate) {
                    calls.draw.push({ target, priceToCoordinate });
                },
            };
        },
        ...overrides,
    };
}

function drawWith(view, points, options = {}) {
    const definition = customSeriesDefinition(view);

    definition.draw({}, {
        series: { byIndex: points },
        options,
        priceScale: { priceToY: (price) => 400 - price },
        timeScale: { barSpacing: 6, indexToX: (index) => 10 + index * 6 },
        target: { marker: 'target' },
        from: 0,
        to: points.length - 1,
    });

    return view.calls;
}

const bar = (values) => ({ raw: { values } });

test('prices for the axis come from the view', () => {
    const definition = customSeriesDefinition(recordingView());

    assert.deepEqual(definition.priceValues({ values: [1, 5, 3] }), [1, 5, 3]);
});

test('non-finite prices are dropped rather than poisoning the scale', () => {
    const definition = customSeriesDefinition(recordingView());

    assert.deepEqual(definition.priceValues({ values: [1, Number.NaN, 3, Infinity] }), [1, 3]);
});

test('a view with no price builder yields no prices instead of throwing', () => {
    const definition = customSeriesDefinition({ update() {}, renderer: () => ({}) });

    assert.deepEqual(definition.priceValues({}), []);
});

test('the view options sit on top of the common series defaults', () => {
    const definition = customSeriesDefinition(recordingView());
    const defaults = definition.defaults();

    assert.equal(defaults.colour, 'red', 'the view supplies its own options');
    assert.equal(defaults.visible, true, 'and still gets the common ones');
});

test('the series is treated as bar-like so its low and high scale the axis', () => {
    assert.equal(customSeriesDefinition(recordingView()).isBarLike, true);
});

test('the view is handed the visible bars with their coordinates', () => {
    const view = recordingView();
    const calls = drawWith(view, [bar([1]), bar([2]), bar([3])]);

    assert.equal(calls.update.length, 1);

    const { bars, barSpacing, visibleRange } = calls.update[0].data;

    assert.equal(bars.length, 3);
    assert.equal(barSpacing, 6);
    assert.deepEqual(visibleRange, { from: 0, to: 3 });
    assert.deepEqual(bars.map((item) => item.x), [10, 16, 22]);
    assert.deepEqual(bars[0].originalData, { values: [1] });
});

test('whitespace and gaps are left out of the bars', () => {
    const view = recordingView();
    const calls = drawWith(view, [bar([1]), { raw: {} }, undefined, bar([4])]);

    assert.equal(calls.update[0].data.bars.length, 2);
});

test('a view is not asked to draw when nothing is visible', () => {
    const view = recordingView();
    const calls = drawWith(view, [{ raw: {} }]);

    assert.equal(calls.update.length, 0);
    assert.equal(calls.renderer, 0);
});

test('the renderer gets the canvas target and a price converter, not a scale', () => {
    const view = recordingView();
    const calls = drawWith(view, [bar([1])]);

    assert.equal(calls.draw.length, 1);
    assert.deepEqual(calls.draw[0].target, { marker: 'target' });
    assert.equal(typeof calls.draw[0].priceToCoordinate, 'function');
    assert.equal(calls.draw[0].priceToCoordinate(100), 300);
});

test('the price converter answers null for a price it cannot place', () => {
    const view = recordingView();
    const definition = customSeriesDefinition(view);

    definition.draw({}, {
        series: { byIndex: [bar([1])] },
        options: {},
        priceScale: { priceToY: () => Number.NaN },
        timeScale: { barSpacing: 6, indexToX: () => 10 },
        target: {},
        from: 0,
        to: 0,
    });

    assert.equal(view.calls.draw[0].priceToCoordinate(1), null);
});

/**
 * Third-party drawing code should not be able to blank the chart it is drawn
 * on — the same bargain primitives get.
 */
test('a view that throws loses its own drawing, not the frame', () => {
    const view = recordingView({
        renderer: () => ({
            draw() {
                throw new Error('bad plugin');
            },
        }),
    });

    assert.doesNotThrow(() => drawWith(view, [bar([1])]));
});

test('the series options reach the view unchanged', () => {
    const view = recordingView();
    const calls = drawWith(view, [bar([1])], { colour: 'blue', lineWidth: 3 });

    assert.deepEqual(calls.update[0].options, { colour: 'blue', lineWidth: 3 });
});
