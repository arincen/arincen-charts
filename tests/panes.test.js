import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createPane,
    layoutPanes,
    paneAtY,
    separatorAt,
    resizePanes,
    resizeSnapshot,
    ensurePane,
    removePane,
    movePane,
    MAIN_PANE_STRETCH,
    SEPARATOR_HEIGHT,
    scaleRecord,
    paneScales,
    leftScale,
} from '../src/panes.js';

const scaleOptions = () => ({ scaleMargins: { top: 0.2, bottom: 0.1 }, mode: 0 });

/**
 * The pane functions take a chart but only ever read four things off it, so a
 * stub is enough — which is the point of their being free functions rather
 * than methods, and is also what keeps them out of the light bundle.
 */
function chartWith(stretchFactors, height = 400) {
    const chart = {
        options: { rightPriceScale: scaleOptions() },
        plot: { left: 0, top: 0, right: 600, bottom: height },
        scheduleRender: () => {},
    };

    chart.panes = stretchFactors.map((factor) => createPane(chart, scaleOptions(), factor));

    layoutPanes(chart);

    return chart;
}

const heightsOf = (chart) => chart.panes.map((pane) => pane.plot.bottom - pane.plot.top);

test('a single pane fills the whole plot', () => {
    const chart = chartWith([1]);

    assert.deepEqual(heightsOf(chart), [400]);
    assert.equal(chart.panes[0].plot.top, 0);
    assert.equal(chart.panes[0].plot.bottom, 400);
});

test('height is split by stretch factor', () => {
    const chart = chartWith([2, 1]);
    const [upper, lower] = heightsOf(chart);

    assert.ok(Math.abs(upper / lower - 2) < 0.05, `expected 2:1, got ${upper}:${lower}`);
});

/**
 * An oscillator dropped under a price chart should take a third of the height,
 * not half of it — which is what lightweight-charts gives you unasked.
 */
test('the main pane is worth two of any pane added after it', () => {
    assert.equal(MAIN_PANE_STRETCH, 2);
});

test('panes tile the plot without gaps or overlap', () => {
    const chart = chartWith([2, 1, 1]);

    chart.panes.forEach((pane, index) => {
        const next = chart.panes[index + 1];

        if (next) {
            assert.equal(next.plot.top, pane.plot.bottom + SEPARATOR_HEIGHT);
        }
    });

    assert.equal(chart.panes[0].plot.top, chart.plot.top);
    assert.equal(chart.panes[chart.panes.length - 1].plot.bottom, chart.plot.bottom);
});

test('the last pane absorbs the rounding rather than leaving a strip of background', () => {
    for (const height of [400, 401, 403, 517]) {
        const chart = chartWith([2, 1], height);

        assert.equal(chart.panes[1].plot.bottom, height, `a gap opened at height ${height}`);
    }
});

test('a pointer lands in the pane it is over', () => {
    const chart = chartWith([2, 1]);
    const [upper, lower] = chart.panes;

    assert.equal(paneAtY(chart, upper.plot.top + 5), upper);
    assert.equal(paneAtY(chart, upper.plot.bottom - 5), upper);
    assert.equal(paneAtY(chart, lower.plot.top + 5), lower);
    assert.equal(paneAtY(chart, lower.plot.bottom - 5), lower);
});

test('the separator has a grab area wider than the line itself', () => {
    const chart = chartWith([2, 1]);
    const edge = chart.panes[0].plot.bottom;

    assert.equal(separatorAt(chart, edge), 0);
    assert.equal(separatorAt(chart, edge + 4), 0, 'a one-pixel target would be undiscoverable');
    assert.equal(separatorAt(chart, edge - 4), 0);
    assert.equal(separatorAt(chart, edge + 40), -1);
});

test('a single-pane chart has no separators', () => {
    const chart = chartWith([1]);

    assert.equal(separatorAt(chart, 200), -1);
});

test('dragging a separator moves height from one pane to the other', () => {
    const chart = chartWith([2, 1]);
    const edge = chart.panes[0].plot.bottom;
    const before = heightsOf(chart);
    const snapshot = resizeSnapshot(chart, 0, edge);

    resizePanes(chart, 0, edge - 60, snapshot);
    layoutPanes(chart);

    const after = heightsOf(chart);

    assert.ok(Math.abs((before[0] - after[0]) - 60) <= 1, `upper moved by ${before[0] - after[0]}`);
    assert.ok(Math.abs((after[1] - before[1]) - 60) <= 1, `lower moved by ${after[1] - before[1]}`);
});

test('a pane cannot be dragged out of existence', () => {
    const chart = chartWith([2, 1]);
    const edge = chart.panes[0].plot.bottom;
    const snapshot = resizeSnapshot(chart, 0, edge);

    resizePanes(chart, 0, edge - 10000, snapshot);
    layoutPanes(chart);

    for (const height of heightsOf(chart)) {
        assert.ok(height >= 25, `a pane was crushed to ${height}px`);
    }
});

/**
 * The property the whole stretch-factor design exists for: resize the chart and
 * the split you dragged to is still the split you get, instead of the bottom
 * pane absorbing every new pixel.
 */
test('a drag survives the chart being resized', () => {
    const chart = chartWith([2, 1]);
    const edge = chart.panes[0].plot.bottom;

    resizePanes(chart, 0, edge - 60, resizeSnapshot(chart, 0, edge));
    layoutPanes(chart);

    const ratioBefore = heightsOf(chart)[0] / heightsOf(chart)[1];

    chart.plot.bottom = 700;
    layoutPanes(chart);

    const ratioAfter = heightsOf(chart)[0] / heightsOf(chart)[1];

    assert.ok(Math.abs(ratioBefore - ratioAfter) < 0.05, `ratio drifted from ${ratioBefore} to ${ratioAfter}`);
});

test('asking for a pane that does not exist creates it', () => {
    const chart = chartWith([2]);

    ensurePane(chart, 2);

    assert.equal(chart.panes.length, 3);
    assert.equal(ensurePane(chart, 1), chart.panes[1]);
});

test('an added pane gets its own price scale, not a shared one', () => {
    const chart = chartWith([2]);
    const added = ensurePane(chart, 1);

    added.options.scaleMargins.top = 0.5;

    assert.notEqual(chart.panes[0].options.scaleMargins.top, 0.5);
});

test('the first pane cannot be removed, only emptied', () => {
    const chart = chartWith([2, 1]);

    chart.panes[0].series.push({ name: 'price' });
    removePane(chart, 0);

    assert.equal(chart.panes.length, 2, 'the main pane owns the chart price scale');
    assert.equal(chart.panes[0].series.length, 0);
});

test('removing a lower pane drops it', () => {
    const chart = chartWith([2, 1, 1]);
    const second = chart.panes[1];

    removePane(chart, 1);

    assert.equal(chart.panes.length, 2);
    assert.ok(! chart.panes.includes(second));
});

test('panes can be reordered', () => {
    const chart = chartWith([2, 1, 1]);
    const last = chart.panes[2];

    movePane(chart, 2, 0);

    assert.equal(chart.panes[0], last);
    assert.equal(chart.panes.length, 3);
});

/* ------------------------------------------------------------ price scales */

/**
 * The pane is the record for the right-hand scale, so the drawing and
 * autoscaling code can treat one shape whether it was handed a pane or a
 * scale. These lock that identity in — it is load-bearing, not incidental.
 */
test('the right-hand scale is the pane itself', () => {
    const chart = chartWith([1]);
    const pane = chart.panes[0];

    assert.equal(scaleRecord(pane, 'right'), pane);
    assert.equal(scaleRecord(pane, undefined), pane);
});

test('another id gets a scale of its own', () => {
    const chart = chartWith([1]);
    const pane = chart.panes[0];
    const left = scaleRecord(pane, 'left');

    assert.notEqual(left, pane);
    assert.notEqual(left.priceScale, pane.priceScale);
    assert.equal(left.autoScale, true);
});

test('the same id always answers with the same scale', () => {
    const pane = chartWith([1]).panes[0];

    assert.equal(scaleRecord(pane, 'volume'), scaleRecord(pane, 'volume'));
    assert.notEqual(scaleRecord(pane, 'volume'), scaleRecord(pane, 'other'));
});

test('a scale carries its own options rather than sharing the pane s', () => {
    const pane = chartWith([1]).panes[0];
    const overlay = scaleRecord(pane, 'volume');

    overlay.options.scaleMargins.top = 0.8;

    assert.notEqual(pane.options.scaleMargins.top, 0.8);
});

test('only the left id draws an axis; every other is an overlay', () => {
    const pane = chartWith([1]).panes[0];

    scaleRecord(pane, 'volume');

    assert.equal(leftScale(pane), null, 'an overlay must not claim the left gutter');

    const left = scaleRecord(pane, 'left');

    assert.equal(leftScale(pane), left);
});

test('a pane with no extra scales lists just itself', () => {
    const pane = chartWith([1]).panes[0];

    assert.deepEqual(paneScales(pane), [pane]);
});

test('every scale is listed, the pane s first', () => {
    const pane = chartWith([1]).panes[0];
    const left = scaleRecord(pane, 'left');
    const overlay = scaleRecord(pane, 'volume');
    const all = paneScales(pane);

    assert.equal(all[0], pane);
    assert.equal(all.length, 3);
    assert.ok(all.includes(left) && all.includes(overlay));
});
