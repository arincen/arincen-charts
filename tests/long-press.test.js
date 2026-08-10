import test from 'node:test';
import assert from 'node:assert/strict';
import { createLongPress } from '../src/touch.js';

/**
 * A clock the test drives by hand, so the rule can be checked without waiting
 * out four hundred real milliseconds and without a fake timer library.
 */
function testClock() {
    const pending = new Map();
    let next = 1;

    return {
        delay: 400,
        slop: 8,
        schedule(callback) {
            pending.set(next, callback);

            return next++;
        },
        cancel(id) {
            pending.delete(id);
        },
        tick() {
            const due = [...pending.values()];

            pending.clear();
            due.forEach((callback) => callback());
        },
        get scheduled() {
            return pending.size;
        },
    };
}

/**
 * A hold and a scroll are indistinguishable at the instant the finger lands —
 * the only thing separating them is what happens next. So the decision waits,
 * and is abandoned the moment the finger travels far enough to have meant a
 * scroll all along.
 */
test('a finger held still becomes a hold', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.start({ x: 100, y: 50 });

    assert.deepEqual(held, [], 'it fired before the finger had held anything');

    clock.tick();

    assert.deepEqual(held, [{ x: 100, y: 50 }], 'the hold never fired');
});

test('a finger that travels was scrolling, and never becomes a hold', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.start({ x: 100, y: 50 });
    press.move({ x: 140, y: 50 });
    clock.tick();

    assert.deepEqual(held, [], 'a scroll was mistaken for a hold');
});

/**
 * No thumb is still. Without slop the feature would work for no one, because
 * the finger always drifts a pixel or two before the timer is up.
 */
test('a small drift is still holding still', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.start({ x: 100, y: 50 });
    press.move({ x: 103, y: 52 });
    press.move({ x: 105, y: 53 });
    clock.tick();

    assert.equal(held.length, 1, 'a steady thumb was treated as a scroll');
});

test('the hold reports where the finger landed, not where it drifted to', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.start({ x: 100, y: 50 });
    press.move({ x: 104, y: 53 });
    clock.tick();

    assert.deepEqual(held[0], { x: 100, y: 50 });
});

test('a cancelled press never fires', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.start({ x: 100, y: 50 });
    press.cancel();
    clock.tick();

    assert.deepEqual(held, []);
    assert.equal(clock.scheduled, 0, 'the timer was left running');
});

test('a second finger landing replaces the first press rather than adding one', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.start({ x: 100, y: 50 });
    press.start({ x: 200, y: 80 });
    clock.tick();

    assert.equal(held.length, 1, 'two holds fired from one finger');
    assert.deepEqual(held[0], { x: 200, y: 80 });
});

test('it fires once, not on every later move', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.start({ x: 100, y: 50 });
    clock.tick();

    press.move({ x: 300, y: 200 });
    clock.tick();

    assert.equal(held.length, 1, 'moving after the hold fired it again');
});

test('moving before any press has started does nothing', () => {
    const held = [];
    const clock = testClock();
    const press = createLongPress((point) => held.push(point), clock);

    press.move({ x: 300, y: 200 });
    clock.tick();

    assert.deepEqual(held, []);
});

test('it reports whether a decision is still outstanding', () => {
    const clock = testClock();
    const press = createLongPress(() => {}, clock);

    assert.equal(press.pending(), false);

    press.start({ x: 10, y: 10 });

    assert.equal(press.pending(), true);

    clock.tick();

    assert.equal(press.pending(), false, 'it stayed pending after firing');
});
