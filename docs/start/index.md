# Install

Arincen Charts draws financial charts on a canvas. It has no dependencies, it
is about twenty kilobytes gzipped, and it does not need a build step unless
you already have one.

This is it, running here. Drag it, scroll to zoom, hover for the crosshair —
that is the whole library, not a video of it.

<ChartDemo :height="300" chart-only>

```js
chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
}).setData(data.slice(-90));

chart.timeScale().fitContent();
```

</ChartDemo>

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
```sh [bun]
bun add @arincen/charts
```
:::

```js
import { createChart, LineSeries } from '@arincen/charts';
```

## Without a build step

A script tag works, and everything lands on one global.

```html
<div id="chart" style="height: 300px"></div>

<script src="https://unpkg.com/@arincen/charts/dist/arincen-charts.standalone.js"></script>
<script>
    const chart = ArincenCharts.createChart(document.getElementById('chart'));
    const series = chart.addSeries(ArincenCharts.LineSeries, {});

    series.setData([
        { time: '2024-01-01', value: 100 },
        { time: '2024-01-02', value: 104 },
        { time: '2024-01-03', value: 102 },
    ]);
</script>
```

This is the same engine, not a cut-down copy. If you are adding a chart to a
page that has no bundler — a Rails view, a WordPress template, a Laravel Blade
file — this is the whole integration.

## Which build

There are two, from one codebase.

| | import | what it carries |
|---|---|---|
| **Light** | `@arincen/charts` | six series types, crosshair, markers, price lines, plugins, pan and zoom |
| **Full** | `@arincen/charts/full` | the above, plus multiple panes, a second price scale, logarithmic and percentage scales, custom series, watermarks, conflation |

Start with the light one. Move to the full one when you reach for something it
does not have — the import is the only line that changes, and nothing else in
your code has to move.

```js
import { createChart } from '@arincen/charts/full';
```

The split is not tree shaking. A bundler cannot remove a feature the core
refers to, and it cannot prove your page has only one pane, so the structural
features are compiled out at build time instead. [How that works, and why it is
not just a smaller bundle](/guide/two-builds).

## TypeScript

Types ship with the package. Nothing to install, and no `@types` entry to hunt
down.

```ts
import { createChart, CandlestickSeries } from '@arincen/charts';

const chart = createChart(document.body, {
    timeScale: { barSpacing: 8 },
});

const series = chart.addSeries(CandlestickSeries, { upColor: '#22ab94' });
```

Every option is described, so a misspelling is an error in your editor rather
than a chart that silently ignores you.

## Browser support

Any browser with `canvas` and `ResizeObserver` — which in practice means
anything from the last several years. There is no polyfill to add and no
fallback to configure.

The chart draws on two canvases: one for the chart, one for the crosshair, so
moving the pointer never redraws the data underneath it.

## What next

- [Your first chart](/start/first-chart) — a complete page, from empty file to
  something on screen
- [Choosing a series](/start/choosing-a-series) — which of the seven to reach
  for, and why
- [Coming from lightweight-charts](/start/migrating) — the API is deliberately
  the same; here is what differs
