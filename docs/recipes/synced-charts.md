# Synchronised charts

Two charts, one pointer and one range: a price above, an indicator below, moving
together. Common enough that most people write it, and it contains one bug
almost everybody writes first.

## The bug, before the code

Chart A's range changes. You tell chart B. Chart B's range changes, so B tells
A. A is already there, but it fires its handler anyway. The two bounce, the
charts judder, and on a slow frame they drift apart instead of converging.

**Break the loop with a flag**, not by comparing ranges — comparing floats
converges slowly and never exactly.

```js
let syncing = false;

function link(from, to) {
    from.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || ! range) {
            return;
        }

        syncing = true;
        to.timeScale().setVisibleLogicalRange(range);
        syncing = false;
    });
}

link(price, volume);
link(volume, price);
```

One flag shared by both directions. A flag per chart does not work — that is
the same loop with more steps.

## Sharing the pointer

```js
price.subscribeCrosshairMove((param) => {
    if (! param.time) {
        volume.clearCrosshairPosition();

        return;
    }

    const point = param.seriesData.get(priceSeries);

    if (point) {
        volume.setCrosshairPosition(point.value ?? point.close, param.time, volumeSeries);
    }
});
```

`setCrosshairPosition(price, time, series)` places the other chart's crosshair;
`clearCrosshairPosition()` removes it when the pointer leaves.

The `! param.time` branch is not optional. Without it the second chart keeps a
crosshair frozen wherever the pointer was when it left, which looks like the
chart stopped responding.

## The whole thing

```js
import { createChart, CandlestickSeries, HistogramSeries } from '@arincen/charts';

const price = createChart(document.getElementById('price'), { autoSize: true });
const volume = createChart(document.getElementById('volume'), {
    autoSize: true,
    timeScale: { visible: false },   // one axis between them, not two
});

const candles = price.addSeries(CandlestickSeries, {});
const bars = volume.addSeries(HistogramSeries, { base: 0 });

candles.setData(data);
bars.setData(volumeFrom(data));

let syncing = false;

function linkRange(from, to) {
    from.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || ! range) { return; }

        syncing = true;
        to.timeScale().setVisibleLogicalRange(range);
        syncing = false;
    });
}

function linkPointer(from, fromSeries, to, toSeries) {
    from.subscribeCrosshairMove((param) => {
        if (! param.time) {
            to.clearCrosshairPosition();

            return;
        }

        const point = param.seriesData.get(fromSeries);

        if (point) {
            to.setCrosshairPosition(point.value ?? point.close, param.time, toSeries);
        }
    });
}

linkRange(price, volume);
linkRange(volume, price);
linkPointer(price, candles, volume, bars);
linkPointer(volume, bars, price, candles);
```

## Running

Two charts, both directions linked, sharing a pointer. Drag or zoom either one.

<ChartDemo :height="420">

```js
// Two panels, each getting a chart of its own.
const top = document.createElement('div');
const bottom = document.createElement('div');

top.style.cssText = 'position:absolute;inset:0 0 42% 0';
bottom.style.cssText = 'position:absolute;inset:60% 0 0 0;border-top:1px solid #e5e5e5';
container.appendChild(top);
container.appendChild(bottom);

const shared = {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: '#f0f0f0' } },
};

const price = createChart(top, { ...shared, timeScale: { visible: false } });
const volume = createChart(bottom, shared);

const candles = price.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
});

const bars = volume.addSeries(HistogramSeries, { base: 0, priceLineVisible: false });
const rows = data.slice(-90);

candles.setData(rows);
bars.setData(rows.map((bar, index) => ({
    time: bar.time,
    value: 1_200_000 + Math.abs(bar.close - bar.open) * 900_000 + (index % 7) * 90_000,
    color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.55)' : 'rgba(242, 54, 69, 0.55)',
})));

// Two axes of the same width, or the plots start at different x positions.
price.priceScale('right').applyOptions({ minimumWidth: 78 });
volume.priceScale('right').applyOptions({ minimumWidth: 78 });

price.timeScale().fitContent();
volume.timeScale().fitContent();

// One flag for both directions. A flag per chart is the same loop, longer.
let syncing = false;

const linkRange = (from, to) => {
    from.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || ! range) {
            return;
        }

        syncing = true;
        to.timeScale().setVisibleLogicalRange(range);
        syncing = false;
    });
};

const linkPointer = (from, fromSeries, to, toSeries) => {
    from.subscribeCrosshairMove((param) => {
        if (! param.time) {
            to.clearCrosshairPosition();

            return;
        }

        const point = param.seriesData.get(fromSeries);

        if (point) {
            to.setCrosshairPosition(point.value ?? point.close, param.time, toSeries);
        }
    });
};

linkRange(price, volume);
linkRange(volume, price);
linkPointer(price, candles, volume, bars);
linkPointer(volume, bars, price, candles);

onCleanup(() => {
    price.remove();
    volume.remove();
});
```

</ChartDemo>

Comment out one `linkRange` line and the two charts drift apart the moment you
pan; comment out the `syncing` flag and they judder.

## Align the price scales, or it will look broken

Two charts have two price scales, sized to their own numbers. A four-digit price
above a two-digit indicator gives two axes of different widths, so the plots
start at different x positions and the two charts are visibly out of step —
which reads as a synchronisation failure and is not one.

```js
price.priceScale('right').applyOptions({ minimumWidth: 64 });
volume.priceScale('right').applyOptions({ minimumWidth: 64 });
```

Pick a width that fits your largest label and set it on both.

## Consider panes instead

If both charts show the same instrument on the same time axis, the full build
does this natively, with no synchronisation code at all:

```js
import { createChart } from '@arincen/charts/full';

const chart = createChart(container, { autoSize: true });

chart.addSeries(CandlestickSeries, {}, 0);          // pane 0
chart.addSeries(HistogramSeries, { base: 0 }, 1);   // pane 1
```

One chart, one time scale, one crosshair, aligned by construction. See
[panes](/guide/panes).

**Use two charts when they are genuinely separate** — different instruments,
different time ranges, one that the reader can collapse. Use panes when it is
one chart drawn in two strips, which is what a price and its volume are.

## Cleaning up

```js
price.remove();
volume.remove();
```

`remove()` drops that chart's own subscriptions. The handlers you registered
*on the other chart* go with that chart when it is removed — so remove both, or
keep the references and unsubscribe explicitly.

## What next

- [Panes](/guide/panes) — the same result without the wiring
- [Crosshair and interaction](/guide/interaction)
- [Price scales](/guide/price-scales) — `minimumWidth`, and why alignment matters
