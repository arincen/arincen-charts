# Your first chart

Here is one, running on this page.

<ChartDemo :height="300">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(219, 39, 119, 0.32)',
    bottomColor: 'rgba(219, 39, 119, 0.02)',
    lineWidth: 2,
});

series.setData(data.map((bar) => ({ time: bar.time, value: bar.value })));
chart.timeScale().fitContent();
```

</ChartDemo>

Drag it. Scroll on it. The code underneath is not a description of what drew
that chart — the page reads that block and runs it. If an example on this site
ever stops working, you will see it stop working rather than reading code that
no longer runs.

::: tip What is already in scope
Live examples start with `chart` created and `data` holding six months of
sample bars — `{ time, open, high, low, close, value }` — so the interesting
lines are not buried under setup. Everything else is imported from the package
in the usual way. Copy any of them into a real file and add the two lines the
next section shows.
:::

## The whole page

Copy this into an empty file and open it. No build step, no bundler.

```html
<!doctype html>
<html>
<body>
    <div id="chart" style="height: 320px"></div>

    <script src="https://unpkg.com/@arincen/charts/dist/arincen-charts.standalone.js"></script>
    <script>
        const chart = ArincenCharts.createChart(document.getElementById('chart'), {
            autoSize: true,
        });

        const series = chart.addSeries(ArincenCharts.AreaSeries, {
            lineColor: '#db2777',
            topColor: 'rgba(219, 39, 119, 0.3)',
            bottomColor: 'rgba(219, 39, 119, 0.02)',
        });

        series.setData([
            { time: '2024-01-01', value: 100 },
            { time: '2024-01-02', value: 104 },
            { time: '2024-01-03', value: 102 },
            { time: '2024-01-04', value: 109 },
            { time: '2024-01-05', value: 107 },
        ]);

        chart.timeScale().fitContent();
    </script>
</body>
</html>
```

The same thing with a bundler:

```js
import { createChart, AreaSeries } from '@arincen/charts';

const chart = createChart(document.getElementById('chart'), { autoSize: true });
const series = chart.addSeries(AreaSeries, {});

series.setData(prices);
chart.timeScale().fitContent();
```

## Give the container a height

::: warning The most common reason a chart does not appear
A chart fills its container. A `div` with no height is nought pixels tall, so
the chart is nought pixels tall, and you get a blank page with no error to
explain it.
:::

```html
<div id="chart" style="height: 320px"></div>
```

Any way of giving it a height works — a CSS class, a grid row, a flex child
that stretches. It only has to be *something* before the chart is created.

If you would rather say it in code, pass the size and leave `autoSize` off:

```js
const chart = createChart(container, { width: 600, height: 320 });
```

## The three lines that matter

```js
const chart = createChart(container, options);   // 1. a chart in a container
const series = chart.addSeries(AreaSeries, {});  // 2. something to draw
series.setData(prices);                          // 3. the data to draw
```

A chart on its own draws axes and a grid. A series is what puts a price on it.
One chart can hold several — here, a price and a ten-bar average of itself,
sharing one price scale because they share units.

<ChartDemo :height="300">

```js
chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 })
    .setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

const average = data.map((bar, index, all) => {
    const window = all.slice(Math.max(0, index - 9), index + 1);
    const total = window.reduce((sum, item) => sum + item.value, 0);

    return { time: bar.time, value: total / window.length };
});

chart.addSeries(LineSeries, { color: '#0891b2', lineWidth: 1 }).setData(average);
chart.timeScale().fitContent();
```

</ChartDemo>

## The shape of the data

Every reading has a `time`. What else it carries depends on the series.

```js
// Line, area, baseline, histogram
{ time: '2024-01-01', value: 104 }

// Candlestick and bar
{ time: '2024-01-01', open: 100, high: 106, low: 99, close: 104 }
```

`time` accepts several forms, and you can use whichever your data already
speaks:

```js
{ time: '2024-01-01' }                        // a business day
{ time: '2024-01-01 14:30:00' }               // a date and time
{ time: 1704067200 }                          // UNIX seconds
{ time: 1704067200000 }                       // UNIX milliseconds, understood too
{ time: { year: 2024, month: 1, day: 1 } }    // if you have the parts
```

**Data must be sorted by time, oldest first.** It is the one requirement the
library will not paper over, because a chart cannot know whether an
out-of-order reading is a mistake or a correction.

### Gaps

Say the exchange was shut for five days. You have two ways to say so, and they
draw differently — the charts below hold the same readings and differ only in
how the closure is expressed.

**Leave the days out, and the axis closes up.** The line is continuous and the
dates jump. This is the default for market data, and it is why weekends take no
room without anyone configuring anything.

<ChartDemo :height="240">

```js
const points = data.slice(0, 40).map((bar) => ({ time: bar.time, value: bar.value }));

// The closure is simply absent from the data.
const closed = points.filter((_, index) => index < 18 || index > 22);

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 }).setData(closed);
chart.timeScale().fitContent();
```

</ChartDemo>

**Send the days with no value, and the axis keeps their room.** Same readings,
same order — but the closure now occupies the space it really took, and the
line is drawn as interrupted because between those dates there was no price.
That break is the feature, not a rendering fault.

<ChartDemo :height="240">

```js
const points = data.slice(0, 40).map((bar) => ({ time: bar.time, value: bar.value }));

// The closure is present, and empty: a time with no value is whitespace.
const held = points.map((point, index) => (
    index >= 18 && index <= 22 ? { time: point.time } : point
));

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 }).setData(held);
chart.timeScale().fitContent();
```

</ChartDemo>

```js
{ time: '2024-01-19', value: 107 }
{ time: '2024-01-20' }              // whitespace: the slot is kept, nothing drawn
```

You rarely need the second one. The time scale is indexed by bar rather than by
elapsed time, so a market that was shut takes no room unless you ask for it.
Whitespace is for when the absence is the point — a suspended instrument, a
halt you want visible, two series that must stay aligned when only one of them
traded.

## Fitting the view

```js
chart.timeScale().fitContent();          // everything on screen
chart.timeScale().scrollToRealTime();    // the newest bar at the right edge
chart.timeScale().setVisibleLogicalRange({ from: 100, to: 160 });
```

Without any of these, the chart shows the most recent bars at its default
spacing. `fitContent` after `setData` is the usual first move.

## Cleaning up

```js
chart.remove();
```

Removes the canvases, unsubscribes the listeners, and tells any custom series
and plugins to release what they were holding. In a single-page application,
call it when the component goes away — the [React](/frameworks/react) and
[Vue](/frameworks/vue) and [Svelte](/frameworks/svelte) guides show where.

## What next

- [Choosing a series](/start/choosing-a-series) — seven of them, and which fits
- [Live data](/start/live-data) — a price that keeps arriving
- [The two builds](/guide/two-builds) — what the full build adds
