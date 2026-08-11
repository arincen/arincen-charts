import test from 'node:test';
import assert from 'node:assert/strict';
import { magnetPrice } from '../src/chart.js';

/** The price alone: the helper reports the scale it came from as well. */
const snappedPrice = (...args) => magnetPrice(...args)?.price ?? null;
import { CrosshairMode } from '../src/options.js';

/**
 * A pane whose price scale maps one price unit to one pixel, upside down, so a
 * pixel distance and a price distance are the same number and the assertions
 * stay readable.
 */
function paneWith(...seriesPoints) {
    const pane = { priceScale: { priceToY: (price) => 500 - price }, series: [] };

    pane.series = seriesPoints.map((byIndex) => ({ options: { visible: true }, byIndex, scale: pane }));

    return pane;
}

const at = (value) => [{ value }];

test('a free crosshair is never pulled off the pointer', () => {
    const pane = paneWith(at(100));

    assert.equal(snappedPrice(pane, 0, 480, CrosshairMode.Normal), null);
    assert.equal(snappedPrice(pane, 0, 480, CrosshairMode.Hidden), null);
});

test('a magnetised crosshair sticks to the closing value', () => {
    const pane = paneWith(at(100));

    assert.equal(snappedPrice(pane, 0, 480, CrosshairMode.Magnet), 100);
});

/**
 * The defect this locks down: snapping to the first series meant that on a
 * chart carrying a price line and a moving average, the crosshair clung to the
 * price however close the pointer came to the average.
 */
test('the crosshair snaps to whichever series is nearest, not the first', () => {
    const pane = paneWith(at(100), at(200));

    assert.equal(snappedPrice(pane, 0, 500 - 190, CrosshairMode.Magnet), 200);
    assert.equal(snappedPrice(pane, 0, 500 - 110, CrosshairMode.Magnet), 100);
});

test('distance is judged in pixels, so a bent axis still snaps to what looks nearest', () => {
    // A scale that compresses high prices, as a logarithmic one does.
    const pane = { priceScale: { priceToY: (price) => 500 - Math.log10(price) * 100 }, series: [] };

    pane.series = [[{ value: 10 }], [{ value: 1000 }]]
        .map((byIndex) => ({ options: { visible: true }, byIndex, scale: pane }));

    // Sits at 2.9 decades: far from 10 in price, close to 1000 on screen.
    assert.equal(snappedPrice(pane, 0, 500 - 290, CrosshairMode.Magnet), 1000);
});

test('an invisible series offers no candidates', () => {
    const pane = paneWith(at(100), at(200));

    pane.series[1].options.visible = false;

    assert.equal(snappedPrice(pane, 0, 500 - 190, CrosshairMode.Magnet), 100);
});

/**
 * A bar exactly as the engine stores one. The fixtures here used to carry a
 * `value` alongside the four prices, which no series ever produces, and that
 * single invented field hid the defect below for the whole life of the file.
 */
const candle = (open, high, low, close) => [{ ts: 1, open, high, low, close }];

/**
 * The defect: the plain magnet looked only for `value`, which is how a line
 * stores its price. A candlestick stores `close`, so on the default crosshair
 * mode candlesticks did not snap at all — and because the failure was "nothing
 * happens" rather than "the wrong thing happens", it read as the magnet being
 * subtle rather than absent.
 */
test('a candlestick snaps in the default magnet mode', () => {
    const pane = paneWith(candle(90, 140, 80, 105));

    assert.equal(snappedPrice(pane, 0, 500 - 104, CrosshairMode.Magnet), 105);
});

test('magnet ignores open, high and low', () => {
    const pane = paneWith(candle(90, 140, 80, 100));

    assert.equal(snappedPrice(pane, 0, 500 - 138, CrosshairMode.Magnet), 100);
});

test('magnet OHLC snaps to whichever of the four prices is nearest', () => {
    const bar = candle(90, 140, 80, 100);

    assert.equal(snappedPrice(paneWith(bar), 0, 500 - 138, CrosshairMode.MagnetOHLC), 140);
    assert.equal(snappedPrice(paneWith(bar), 0, 500 - 82, CrosshairMode.MagnetOHLC), 80);
    assert.equal(snappedPrice(paneWith(bar), 0, 500 - 91, CrosshairMode.MagnetOHLC), 90);
});

test('a bar with no data at that index is skipped', () => {
    const pane = paneWith([undefined, { value: 100 }]);

    assert.equal(snappedPrice(pane, 0, 480, CrosshairMode.Magnet), null);
    assert.equal(snappedPrice(pane, 1, 480, CrosshairMode.Magnet), 100);
});

test('whitespace offers nothing to snap to', () => {
    const pane = paneWith([{ value: null }]);

    assert.equal(snappedPrice(pane, 0, 480, CrosshairMode.Magnet), null);
});

/**
 * With two price scales the same height is two different prices, so a series
 * has to be measured through the scale it was drawn against — measuring
 * everything through the pane's own scale makes the crosshair jump to the
 * series whose numbers merely happen to be closest.
 */
test('a series on its own scale is measured through that scale', () => {
    const pane = { priceScale: { priceToY: (price) => 500 - price }, series: [] };
    const overlay = { priceScale: { priceToY: (price) => 500 - price / 100 } };

    pane.series = [
        { options: { visible: true }, byIndex: [{ value: 100 }], scale: pane },
        { options: { visible: true }, byIndex: [{ value: 30000 }], scale: overlay },
    ];

    // 30000 on the overlay sits at y=200, far from 100 in price but next to it
    // on screen; the pointer at y=205 belongs to the overlay series.
    assert.equal(snappedPrice(pane, 0, 205, CrosshairMode.Magnet), 30000);
    assert.equal(snappedPrice(pane, 0, 395, CrosshairMode.Magnet), 100);
});

test('an empty pane leaves the pointer alone', () => {
    assert.equal(snappedPrice(paneWith(), 0, 480, CrosshairMode.Magnet), null);
});
