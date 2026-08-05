# Getting started

## Install

::: code-group
```sh [npm]
npm install @arincen/charts
```
```sh [pnpm]
pnpm add @arincen/charts
```
```sh [yarn]
yarn add @arincen/charts
```
:::

Or use it with no build step at all:

```html
<div id="chart" style="height: 300px"></div>
<script src="https://unpkg.com/@arincen/charts/dist/arincen-charts.standalone.js"></script>
<script>
    const chart = ArincenCharts.createChart(document.getElementById('chart'));
    chart.addAreaSeries({}).setData(data);
</script>
```

## Your first chart

```js
import { createChart, AreaSeries } from '@arincen/charts';

const chart = createChart(document.getElementById('chart'), {
    autoSize: true,
    layout: {
        background: { type: 'solid', color: '#ffffff' },
        textColor: '#191919',
    },
});

const series = chart.addSeries(AreaSeries, {
    lineColor: '#2962ff',
    topColor: 'rgba(41, 98, 255, 0.28)',
    bottomColor: 'rgba(41, 98, 255, 0)',
    lineWidth: 2,
});

series.setData(data);
chart.timeScale().fitContent();
```

`autoSize: true` makes the chart follow its container. Without it, pass `width` and `height`, or call `chart.resize(width, height)` yourself.

## Data

Every point needs a `time`. Three shapes are accepted, and you get back whatever you passed in:

```js
series.setData([
    { time: '2026-01-01', value: 24.1 },                        // date string
    { time: 1767225600, value: 24.8 },                          // unix seconds
    { time: { year: 2026, month: 1, day: 5 }, value: 24.4 },    // business day
]);
```

Bar-like series take four prices instead of one:

```js
series.setData([
    { time: '2026-01-01', open: 24.0, high: 24.4, low: 23.8, close: 24.1 },
]);
```

### Whitespace

A point with a time but no value holds its slot on the axis and breaks the line:

```js
series.setData([
    { time: '2026-01-01', value: 24.1 },
    { time: '2026-01-02' },                  // gap, not a straight line across
    { time: '2026-01-03', value: 24.4 },
]);
```

Use it for a market halt, or a session with no trades. Leaving the point out entirely would close the gap as though nothing happened.

## Live updates

```js
series.update({ time: '2026-01-05', value: 24.62 });
```

`update` replaces the last point if the time matches, and appends if it is newer. It does not re-sort the whole series, so it is cheap enough to call on every tick.

## Reacting to the crosshair

```js
chart.subscribeCrosshairMove((param) => {
    if (! param.time) {
        return;                              // pointer left the chart
    }

    const point = param.seriesData.get(series);

    console.log(param.time, point?.value);
});
```

This is how tooltips and legends are built. Neither is part of the library — both are a few lines of your own HTML fed by this event.

## Cleaning up

```js
chart.remove();
```

Removes the element, the listeners and the resize observer. Call it when your component unmounts, or the chart will keep observing a container that is no longer on the page.

## Next

- [Two builds](/guide/two-builds) — which one you want, and why there are two
- [Series](/guide/series) — the six types and their options
- [Primitives](/guide/primitives) — drawing your own things on top
