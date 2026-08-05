# Panes

::: tip Full build only
Panes are in `@arincen/charts/full`.
:::

A pane is a plotting area with its own price scale and its own vertical slice
of the chart. Every chart has one; a chart in the full build can have more.

## Adding one

Panes are created by putting a series on one:

```js
import { createChart, CandlestickSeries, HistogramSeries } from '@arincen/charts/full';

const chart = createChart(container);

chart.addSeries(CandlestickSeries, {}, 0);   // price, pane 0
chart.addSeries(HistogramSeries, {}, 1);     // volume, pane 1 — created here
```

The third argument is the pane index. Asking for a pane that does not exist
creates it.

## Proportions, not pixels

Height is divided by **stretch factor**, not by a fixed pixel height. That is
what survives a resize: drag a divider, then resize the chart, and the split
you chose is still the split you get.

The first pane is worth two of any pane added after it, so an oscillator
dropped underneath a price chart takes a third of the height rather than half.

```js
const [price, volume] = chart.panes();

volume.setStretchFactor(0.5);   // relative to the others
volume.getHeight();             // in CSS pixels
volume.setHeight(120);          // stored as the factor that produces it
```

## Resizing by hand

The divider between two panes is draggable, with a grab area wider than the
line itself. Turn it off with:

```js
createChart(container, { layout: { panes: { enableResize: false } } });
```

## The pane API

```js
const panes = chart.panes();

panes[1].paneIndex();
panes[1].getSeries();
panes[1].moveTo(0);              // reorder
panes[1].priceScale();
panes[1].attachPrimitive(p);     // draws on the whole pane, not one series
```

`chart.removePane(index)` drops a pane. The first pane cannot be removed — it
owns the chart's main price scale — so removing it clears its series instead.

## The crosshair across panes

The vertical line runs the full height: the same bar is under the cursor
everywhere. The horizontal line stays in its own pane, because it is a price,
and a price only means something on the scale it was read from.
