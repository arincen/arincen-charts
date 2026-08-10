import './support/full-build.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { tracePath } from '../src/series.js';
import { continuousPhase, pulsePhase } from '../src/chart.js';
import { LineType } from '../src/options.js';

/** A path that records where it was told to go instead of drawing. */
function recordingPath() {
    const ops = [];

    return {
        ops,
        moveTo(x, y) {
            ops.push({ op: 'move', x, y });
        },
        lineTo(x, y) {
            ops.push({ op: 'line', x, y });
        },
        bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
            ops.push({ op: 'curve', c1x, c1y, c2x, c2y, x, y });
        },
    };
}

const segment = [
    { x: 0, y: 100 },
    { x: 10, y: 60 },
    { x: 20, y: 80 },
    { x: 30, y: 20 },
];

/**
 * The defect this locks down: `tracePath` used to place the pen itself. Inside
 * a path an area had already opened — down from its first point to the
 * baseline — that `moveTo` began a second subpath, so `closePath` cut a
 * diagonal clean across the fill. It was visible on every area and baseline
 * chart and invisible to every test, because the tests only ever traced a path
 * that had not been started yet.
 */
test('tracing never moves the pen, so an area fill stays one shape', () => {
    for (const lineType of [LineType.Simple, LineType.WithSteps, LineType.Curved]) {
        const path = recordingPath();

        tracePath(path, segment, lineType);

        assert.ok(
            ! path.ops.some((op) => op.op === 'move'),
            `line type ${lineType} started a new subpath mid-fill`,
        );
    }
});

test('a simple line goes straight from point to point', () => {
    const path = recordingPath();

    path.moveTo(segment[0].x, segment[0].y);
    tracePath(path, segment, LineType.Simple);

    assert.deepEqual(path.ops.map((op) => op.op), ['move', 'line', 'line', 'line']);
    assert.deepEqual(
        path.ops.map((op) => [op.x, op.y]),
        segment.map((point) => [point.x, point.y]),
    );
});

/**
 * The shape that makes a policy rate honest: the value holds at its old level
 * all the way to the moment it changes, then jumps. A diagonal would say the
 * rate glided between meetings, which is not what happened.
 */
test('a stepped line holds its value, then jumps', () => {
    const path = recordingPath();

    path.moveTo(segment[0].x, segment[0].y);
    tracePath(path, segment, LineType.WithSteps);

    assert.deepEqual(path.ops.map((op) => [op.op, op.x, op.y]), [
        ['move', 0, 100],
        ['line', 10, 100],   // holds the old value across to the new time
        ['line', 10, 60],    // then jumps to the new value
        ['line', 20, 60],
        ['line', 20, 80],
        ['line', 30, 80],
        ['line', 30, 20],
    ]);
});

test('a stepped line never moves in both directions at once', () => {
    const path = recordingPath();

    path.moveTo(segment[0].x, segment[0].y);
    tracePath(path, segment, LineType.WithSteps);

    for (let i = 1; i < path.ops.length; i++) {
        const from = path.ops[i - 1];
        const to = path.ops[i];

        assert.ok(
            from.x === to.x || from.y === to.y,
            `a diagonal crept into the staircase between ${from.x},${from.y} and ${to.x},${to.y}`,
        );
    }
});

/**
 * A curve that misses its own data would be worse than no curve: the chart
 * would be showing prices that were never traded. Every bézier must land
 * exactly on the next reading.
 */
test('a curve passes through every point it was given', () => {
    const path = recordingPath();

    path.moveTo(segment[0].x, segment[0].y);
    tracePath(path, segment, LineType.Curved);

    const landed = [path.ops[0], ...path.ops.slice(1)].map((op) => [op.x, op.y]);

    assert.deepEqual(landed, segment.map((point) => [point.x, point.y]));
});

test('a curve is drawn with curves, not with straight lines', () => {
    const path = recordingPath();

    path.moveTo(segment[0].x, segment[0].y);
    tracePath(path, segment, LineType.Curved);

    assert.ok(path.ops.slice(1).every((op) => op.op === 'curve'), 'the curve was drawn straight');
});

/**
 * Two points cannot describe a curve — there is no neighbour on either side to
 * take a direction from — so it falls back to a straight line rather than
 * inventing a bulge.
 */
test('a curve through two points is a straight line', () => {
    const path = recordingPath();

    path.moveTo(0, 0);
    tracePath(path, [{ x: 0, y: 0 }, { x: 10, y: 10 }], LineType.Curved);

    assert.deepEqual(path.ops.map((op) => op.op), ['move', 'line']);
});

test('an unknown line type behaves as a simple line rather than drawing nothing', () => {
    const path = recordingPath();

    path.moveTo(segment[0].x, segment[0].y);
    tracePath(path, segment, 99);

    assert.equal(path.ops.length, segment.length);
});

/* ---------------------------------------------------------- the live pulse */

/**
 * An animation that never reports itself finished is a chart that never stops
 * asking for frames — a battery complaint rather than a visible bug — so the
 * end of a pulse is a tested property, not an implementation detail.
 */
test('a pulse runs from its start and then reports itself done', () => {
    assert.equal(pulsePhase(1000, 1000), 0);
    assert.ok(pulsePhase(1000, 2300) > 0.4 && pulsePhase(1000, 2300) < 0.6);
    assert.equal(pulsePhase(1000, 9999), null, 'the pulse never ended');
});

test('a pulse that has not started is not running', () => {
    assert.equal(pulsePhase(0, 5000), null);
    assert.equal(pulsePhase(undefined, 5000), null);
});

test('a clock that jumps backwards does not start a pulse', () => {
    assert.equal(pulsePhase(5000, 1000), null);
});

test('a continuous pulse always has somewhere to be', () => {
    for (const now of [0, 1, 1300, 2599, 2600, 10_000, 123_456]) {
        const phase = continuousPhase(now);

        assert.ok(phase >= 0 && phase < 1, `phase ${phase} at ${now} is outside one breath`);
    }
});

test('a continuous pulse wraps rather than stopping', () => {
    assert.equal(continuousPhase(0), continuousPhase(2600));
});
