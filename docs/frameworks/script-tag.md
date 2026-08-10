# No build step

A script tag, a `div`, and you are done. No bundler, no npm, no build.

```html
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
    ]);

    chart.timeScale().fitContent();
</script>
```

**This is the same engine**, not a cut-down copy. Everything in these docs
applies; the only difference is that the exports arrive on one global instead
of through `import`.

```js
const { createChart, LineSeries, CandlestickSeries, LineStyle } = ArincenCharts;
```

## Which file

| | |
|---|---|
| `dist/arincen-charts.standalone.js` | the light build |
| `dist/arincen-charts-full.standalone.js` | panes, custom series, non-linear scales, watermarks, conflation |

Both define `window.ArincenCharts`, so moving between them is one `src`
attribute. See [the two builds](/guide/two-builds).

## Pin the version

```html
<script src="https://unpkg.com/@arincen/charts@0.1.0/dist/arincen-charts.standalone.js"></script>
```

Without a version you get whatever is newest, on every page load, forever. That
is fine while you are trying it out and it is not fine in production — pin it,
and move deliberately.

Better still, serve it yourself. It is one file with no dependencies, so
copying it into your own assets removes a third-party origin from your page's
critical path.

## Where to put the tag

```html
<script src=".../arincen-charts.standalone.js"></script>
```

At the end of `<body>`, or with `defer` in the head. Not `async` — `async` says
you do not care when it runs, and the code below it does.

## Server-rendered pages

The pattern for a Blade, ERB, Twig or Django template: render the data into the
page and read it back.

```html
<div id="chart" style="height: 320px"></div>

<script type="application/json" id="chart-data">
    {{ json_encode($candles) }}
</script>

<script src="https://unpkg.com/@arincen/charts/dist/arincen-charts.standalone.js"></script>
<script>
    const candles = JSON.parse(document.getElementById('chart-data').textContent);
    const chart = ArincenCharts.createChart(document.getElementById('chart'), { autoSize: true });

    chart.addSeries(ArincenCharts.CandlestickSeries, {}).setData(candles);
    chart.timeScale().fitContent();
</script>
```

A `<script type="application/json">` block rather than a JavaScript literal:
the browser does not execute it, so a stray quote or a `</script>` inside your
data cannot break the page or become an injection.

## Several charts on one page

```html
<div class="chart" data-symbol="AAPL" style="height: 240px"></div>
<div class="chart" data-symbol="MSFT" style="height: 240px"></div>

<script>
    document.querySelectorAll('.chart').forEach(async (element) => {
        const chart = ArincenCharts.createChart(element, { autoSize: true });
        const series = chart.addSeries(ArincenCharts.LineSeries, {});

        series.setData(await fetch(`/api/prices/${element.dataset.symbol}`).then((r) => r.json()));
        chart.timeScale().fitContent();
    });
</script>
```

Each chart is independent. Nothing is shared and nothing is global except the
library itself.

## Turbo, htmx and anything that swaps HTML

If your framework replaces DOM without a full page load, the chart's container
can be removed while the chart is still holding it. That is a leak of two
canvases, a `ResizeObserver` and a set of listeners, per swap.

```js
const charts = new Map();

document.addEventListener('turbo:before-render', () => {
    charts.forEach((chart) => chart.remove());
    charts.clear();
});
```

The same applies to htmx's `htmx:beforeSwap` and any router that owns the DOM.
Call `chart.remove()` before the node goes.

## Modules without a bundler

Modern browsers import ES modules directly, which gets you named imports with
no build step:

```html
<script type="module">
    import { createChart, LineSeries } from 'https://unpkg.com/@arincen/charts/dist/index.mjs';

    const chart = createChart(document.getElementById('chart'), { autoSize: true });

    chart.addSeries(LineSeries, {}).setData(prices);
</script>
```

Slower to start than the standalone file — the browser fetches and parses the
module graph — but it keeps the import syntax the rest of these docs use.

## What next

- [Your first chart](/start/first-chart)
- [The two builds](/guide/two-builds)
- [A sparkline](/recipes/sparkline) — the smallest useful chart
