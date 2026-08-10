# Large datasets

Most charts hold hundreds of readings and nothing on this page applies to them.
This is about the ones that hold half a million.

## What actually costs

A frame is three things: deciding what is visible, drawing it, and drawing the
axes. Only the first is proportional to how much data you hold, and only if it
is written carelessly.

| | cost |
|---|---|
| `setData` on 500k readings | one pass, once |
| `update` on the live edge | one reading, one frame |
| a pan or zoom frame | proportional to what is **visible**, not what is held |
| a crosshair move | nothing — it is a separate canvas |

The chart never walks the whole dataset to draw a frame. It binary-searches the
visible span and draws that. Holding a million readings and showing two hundred
costs what showing two hundred costs.

## The one that bites: too many readings per pixel

Zoom out far enough and the visible span is the whole dataset. Now the chart is
asked to draw 500,000 candles into 800 pixels — six hundred per column, each
one drawn over the last, all but one invisible.

That frame is slow, and the pixels it produces are identical to a frame that
drew six hundred times less.

## Conflation

```js
chart.applyOptions({ timeScale: { enableConflation: true } });
```

Readings that would land in the same pixel column are merged before anything is
drawn: one open, one close, the highest high and the lowest low. The picture is
the same because it was always the same — you cannot see six hundred candles in
one column.

<ChartDemo :height="320">

```js
// Fifty thousand readings, drawn whole.
const day = 24 * 60 * 60;
const many = [];
let price = 100;
let seed = 7;

for (let index = 0; index < 50_000; index++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    price += (seed / 0x7fffffff - 0.5) * 0.8;
    many.push({ time: 946684800 + index * day, value: price });
}

chart.applyOptions({ timeScale: { enableConflation: true } });

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 1 }).setData(many);
chart.timeScale().fitContent();
```

</ChartDemo>

Pan and zoom it. Fifty thousand readings; the frames are drawn from about a
thousand.

### It is off by default

Because it costs memory to build and most charts would pay for it without
gaining anything. Turn it on when your dataset is large enough that a fully
zoomed-out frame feels heavy — tens of thousands of readings, not thousands.

### How it works

Not sampled per frame. When conflation is enabled, the series is precomputed
into a ladder of increasingly coarse levels, each half the resolution of the
one below, like mipmaps. Drawing picks the level whose readings are about a
pixel apart and walks that.

That is why zooming stays smooth rather than stuttering at the moment the
threshold is crossed: the work was done once, at `setData`.

```js
chart.applyOptions({
    timeScale: {
        enableConflation: true,
        conflationThresholdFactor: 1,   // higher merges sooner, lower merges later
    },
});
```

A series can override the chart, which is how a dense price and a sparse
indicator on one chart get different treatment:

<ChartDemo :height="300">

```js
const day = 24 * 60 * 60;
const many = [];
let price = 100;
let seed = 31;

for (let index = 0; index < 40_000; index++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    price += (seed / 0x7fffffff - 0.5) * 0.7;
    many.push({ time: 946684800 + index * day, value: price });
}

chart.applyOptions({
    timeScale: {
        enableConflation: true,

        // Chart-wide: merge once readings are within a pixel of each other.
        conflationThresholdFactor: 1,
    },
});

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 1 }).setData(many);

// This one merges twice as eagerly as the chart would: a smoother, cheaper
// line, which is the right trade for a slow-moving average and the wrong one
// for the price it is drawn over.
chart.addSeries(LineSeries, {
    color: '#0891b2',
    lineWidth: 1,
    conflationThresholdFactor: 2,
    priceLineVisible: false,
    lastValueVisible: false,
}).setData(many.map((point, index) => ({
    time: point.time,
    value: point.value - 4 + Math.sin(index / 900) * 2,
})));

chart.timeScale().fitContent();
```

</ChartDemo>

### What it costs

The ladder is packed — one entry per merged run, not one per original reading —
so the whole ladder is roughly the size of the original data again, not
thirteen copies of it. An early version was not packed and used 80 MB where it
should have used 6; if you are reading old benchmarks, that is why.

Turning it off releases the ladder:

```js
chart.applyOptions({ timeScale: { enableConflation: false } });
```

## Loading history

Do not hold data the reader will never scroll to. The pattern is to load a
window and extend it when the viewport approaches an end:

```js
chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (range && range.from < 20 && ! loading) {
        loadOlder();
    }
});
```

The logical range is unclamped, so `range.from` goes negative once the viewport
runs past the start of the data — which is the signal. See
[load history on scroll](/recipes/infinite-history).

## Things that make it slow

**Calling `setData` on every tick.** It rebuilds the series and, with
conflation on, the whole ladder. Use `update` for the live edge and keep
`setData` for history and corrections.

**Calling `fitContent()` on every tick.** It refits the range on every reading,
so the chart zooms out forever and the reader cannot hold a zoom level.

**A crosshair handler that does real work.** It runs on every pointer move.
Read from `param.seriesData` and write to the DOM; do not recompute an
indicator there.

**Unsorted data.** Sorting is your job; the chart trusts the order it is given.
Sorting half a million readings on every `setData` because they arrived
unsorted is a cost that belongs at your API boundary, once.

**Several charts, each with its own resize observer, on one page.** Fine for
three, less fine for thirty. A table of thirty
[sparklines](/recipes/sparkline) should switch off interaction and axes, which
removes most of the per-chart cost.

## Measuring rather than guessing

```js
const start = performance.now();

series.setData(points);
chart.timeScale().fitContent();

requestAnimationFrame(() => console.log(`${(performance.now() - start).toFixed(1)}ms`));
```

Measure the frame, not the call. `setData` returns before anything is drawn —
the render is scheduled — so timing the call alone reports a number that has
nothing to do with what the reader waits for.

## What next

- [Live data](/start/live-data) — the update path, and how not to fight it
- [Load history on scroll](/recipes/infinite-history)
- [The time scale](/guide/time-scale) — ranges, and what "logical" means
