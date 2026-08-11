import { container } from './support/headless-dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sparkline } from '../src/index.js';
import { CrosshairMode } from '../src/options.js';

/**
 * The forty-line recipe, in one call.
 *
 * A sparkline is not a small chart: six chart options and three series options
 * have to be turned off before a chart becomes a shape in a table cell, and
 * every one of them is a thing to forget. Forgetting the interaction ones is
 * the expensive kind — a 60×20 chart that accepts a drag gets dragged by
 * accident on every scroll of the table it lives in, and the reader has no
 * axis, no scrollbar and no way to put it back.
 *
 * The light build deliberately: thirty sparklines in a table is the case the
 * light build exists for.
 */

const day = 24 * 60 * 60;
const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);

const rising = Array.from({ length: 30 }, (_, index) => ({
    time: start + index * day,
    value: 100 + index,
}));

const falling = rising.map((point, index) => ({ ...point, value: 130 - index }));

const build = (values = rising, options = {}) => sparkline(
    container(),
    values,
    { width: 120, height: 30, ...options },
);

/* ------------------------------------------------------------ it is a picture */

test('nothing about it can be dragged, zoomed or hovered', () => {
    const spark = build();
    const options = spark.chart.options();

    for (const [name, value] of Object.entries(options.handleScroll)) {
        assert.equal(value, false, `handleScroll.${name} is on`);
    }

    for (const [name, value] of Object.entries(options.handleScale)) {
        assert.equal(value, false, `handleScale.${name} is on`);
    }

    assert.equal(options.crosshair.mode, CrosshairMode.Hidden);

    spark.remove();
});

test('it has no axes, no grid and no attribution', () => {
    const options = build().chart.options();

    assert.equal(options.rightPriceScale.visible, false);
    assert.equal(options.leftPriceScale.visible, false);
    assert.equal(options.timeScale.visible, false);
    assert.equal(options.grid.vertLines.visible, false);
    assert.equal(options.grid.horzLines.visible, false);
    assert.equal(options.layout.attributionLogo, false);
});

test('and the series asks for no room it has not got', () => {
    const options = build().series.options();

    assert.equal(options.priceLineVisible, false);
    assert.equal(options.lastValueVisible, false);
    assert.equal(options.crosshairMarkerVisible, false);
});

test('it says nothing about the data', () => {
    const original = globalThis.console.warn;
    const said = [];

    globalThis.console.warn = (message) => said.push(String(message));

    try {
        // Thirty rows of a table, each with a feed of its own. Whatever is
        // wrong with them, saying it thirty times is not how anybody finds
        // out — and a table cell is not where you go looking for warnings.
        build([...falling].reverse().concat(falling));

        assert.deepEqual(said, []);
    } finally {
        globalThis.console.warn = original;
    }
});

/* ---------------------------------------------------------------- the colour */

test('a series that ended higher is green, and one that ended lower is red', () => {
    assert.equal(build(rising).series.options().lineColor, '#22ab94');
    assert.equal(build(falling).series.options().lineColor, '#f23645');
});

test('the direction is first against last, not the final two readings', () => {
    // A sparkline answers "how did this go over the period". Colouring by the
    // last tick makes it flicker between red and green on a chart whose whole
    // point is the trend.
    const dippedAtTheEnd = [...rising];

    dippedAtTheEnd[dippedAtTheEnd.length - 1] = {
        time: start + 29 * day,
        value: rising[rising.length - 2].value - 5,
    };

    assert.equal(build(dippedAtTheEnd).series.options().lineColor, '#22ab94');
});

test('a colour of your own wins over the direction', () => {
    assert.equal(build(falling, { color: '#db2777' }).series.options().lineColor, '#db2777');
});

test('the fill is derived from the line, not asked for separately', () => {
    const options = build(rising).series.options();

    assert.equal(options.topColor, 'rgba(34, 171, 148, 0.28)');
    assert.equal(options.bottomColor, 'rgba(34, 171, 148, 0)');
});

test('a line sparkline has no fill at all', () => {
    const options = build(rising, { type: 'line' }).series.options();

    assert.equal(options.color, '#22ab94');
    assert.equal(options.topColor, undefined);
});

/* ------------------------------------------------------------------ the data */

test('the readings are in and framed', () => {
    const spark = build();
    const drawn = spark.chart._internal.allSeries[0].points;

    assert.equal(drawn.length, 30);

    const { from, to } = spark.chart.timeScale().getVisibleLogicalRange();

    assert.ok(from <= 0.01 && to >= 28.99, `only ${from} to ${to} is on screen`);

    spark.remove();
});

test('replacing the data re-reads the direction with it', () => {
    const spark = build(rising);

    assert.equal(spark.series.options().lineColor, '#22ab94');

    spark.setData(falling);

    // The live case: a table of thirty rows, each repainting on a tick. A
    // sparkline that keeps yesterday's colour is worse than one with none.
    assert.equal(spark.series.options().lineColor, '#f23645');

    spark.remove();
});

test('an empty sparkline draws nothing and does not throw', () => {
    const spark = build([]);

    assert.equal(spark.chart._internal.allSeries[0].points.length, 0);

    spark.remove();
});

test('it can be taken away', () => {
    const spark = build();

    spark.remove();

    assert.equal(spark.chart._internal.removed, true);
});
