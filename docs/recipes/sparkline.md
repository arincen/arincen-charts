# A sparkline

The smallest useful chart: no axes, no grid, no crosshair, no interaction. A
shape in a table cell.

```js
import { sparkline } from '@arincen/charts';

const spark = sparkline(cell, values);
```

That is the whole thing. It draws green if the series ended higher than it
started and red if it did not, fills under the line, fits the readings to the
width, and switches off everything a chart this size has no room for.

<ChartDemo :height="90" chart-only>

```js
const values = data.slice(-60).map((bar) => ({ time: bar.time, value: bar.value }));

// `sparkline` builds its own chart, so the one this page made is let go of
// first — two charts in one box would stack, not overlap.
chart.remove();

sparkline(container, values);
```

</ChartDemo>

```js
sparkline(cell, values, {
    color: '#db2777',   // omitted: green if it ended higher, red if it did not
    type: 'line',       // 'area' by default, which fills under the line
    lineWidth: 2,
    width: 120,         // omitted: follows the container
    height: 30,
});
```

The handle it returns is for the live case — a table of thirty rows, each
repainting on a tick:

```js
const spark = sparkline(cell, values);

spark.setData(next);   // re-reads the direction, so the colour follows it
spark.remove();
spark.chart;           // the chart underneath, if you must
spark.series;
```

**`setData` is the whole update path.** There is no `update` on a sparkline: at
this size the difference between appending one reading and replacing sixty is
not worth an API, and the colour has to be reconsidered either way.

**Interaction cannot be turned back on.** A 60×20 chart that accepts a drag
gets dragged by accident on every scroll of the table it lives in, and the
reader has no axis, no scrollbar and no way to put it back. If you want
something draggable, you want a chart.

**It says nothing about its data.** [Validation](/api/chart-options#when-the-data-is-wrong)
is off: thirty cells each warning about the same feed is not how anybody finds
out, and a table cell is not where you go looking.

## The long way

What the one call is doing, in case you want to do it differently:

<ChartDemo :height="90" chart-only>

```js
chart.applyOptions({
    handleScroll: false,
    handleScale: false,
    crosshair: { mode: CrosshairMode.Hidden },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    rightPriceScale: { visible: false },
    leftPriceScale: { visible: false },
    timeScale: { visible: false },
    layout: { background: { type: 'solid', color: 'transparent' }, attributionLogo: false },
});

const values = data.slice(-60).map((bar) => ({ time: bar.time, value: bar.value }));
const rising = values[values.length - 1].value >= values[0].value;

chart.addSeries(AreaSeries, {
    lineColor: rising ? '#22ab94' : '#f23645',
    topColor: rising ? 'rgba(34, 171, 148, 0.28)' : 'rgba(242, 54, 69, 0.28)',
    bottomColor: 'rgba(0, 0, 0, 0)',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
}).setData(values);

chart.timeScale().fitContent();
```

</ChartDemo>

## The options that matter

Six switches turn a chart into a picture. All of them are off-by-omission
elsewhere in these docs, so here they are in one place:

```js
handleScroll: false,                        // no panning
handleScale: false,                         // no zooming
crosshair: { mode: CrosshairMode.Hidden },  // no pointer tracking
grid: { vertLines: { visible: false }, horzLines: { visible: false } },
rightPriceScale: { visible: false },
timeScale: { visible: false },
```

Plus three on the series, so it does not draw a price line and a value tag it
has no room for:

```js
priceLineVisible: false,
lastValueVisible: false,
crosshairMarkerVisible: false,
```

**Turning interaction off is not optional at this size.** A 60×20 chart that
accepts a drag will be dragged by accident on every scroll of the table it
lives in, and the reader has no way to get it back.

## Colour by direction

```js
const rising = values[values.length - 1].value >= values[0].value;
```

First reading against last, not the last two. A sparkline answers "how did this
go over the period", and colouring it by the final tick makes it flicker
between red and green on a chart whose whole point is the trend.

## Thirty of them in a table

```html
<td><div class="spark" data-symbol="AAPL"></div></td>
```

```js
const sparks = [];

document.querySelectorAll('.spark').forEach((element) => {
    sparks.push(sparkline(element, seriesFor(element.dataset.symbol)));
});

// Whenever the table is replaced — a sort, a filter, a page change.
function teardown() {
    sparks.forEach((spark) => spark.remove());
    sparks.length = 0;
}
```

Each chart carries its own `ResizeObserver` and its own pair of canvases. Thirty
is fine; three hundred is a scroll you will feel, and at that point you want one
canvas and a loop, not three hundred charts.

**Call `remove()` when the row goes.** A table that re-renders on sort and never
removes its charts leaks two canvases per row per sort, and it presents as "the
page gets slower the longer you use it".

## Fixed size instead of `autoSize`

```js
sparkline(element, values, { width: 120, height: 32 });
```

In a dense table this is worth doing: `autoSize` attaches a `ResizeObserver` per
chart, and thirty observers watching thirty cells that never change size is work
for nothing.

## What next

- [No build step](/frameworks/script-tag) — sparklines in a server-rendered table
- [Crosshair and interaction](/guide/interaction) — the options this page turns off
