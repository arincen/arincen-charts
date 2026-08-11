# Arincen Charts

[Documentation](https://docs.arincen.com/charts) · [Overview](https://en.arincen.com/charts)

A financial chart that draws itself on a canvas, in about **20 KB gzipped**, with **zero dependencies**.

Both numbers are checked rather than claimed: a test gzips the shipped bundle and fails if it has grown past its budget or if the figure written here is not the one it measured, and there is nothing in `dependencies` to audit.

## Two builds from one codebase

The unusual part. Most of what a charting library carries is structural — panes, non-linear price scales, custom series — and most pages never use any of it. Tree-shaking cannot remove it, because the core genuinely references it and a bundler cannot prove your page has one pane.

So the split is made at build time:

| | size | has |
|---|---|---|
| `@arincen/charts` | ~20 KB | line, area, candlestick, bar, histogram, baseline · crosshair · markers · price lines · primitives · pan/zoom |
| `@arincen/charts/full` | ~26 KB | all of that, plus panes, logarithmic / percentage / indexed price scales, left and overlay scales, custom series, watermarks, touch tracking, kinetic scroll |

```js
import { createChart, AreaSeries } from '@arincen/charts';
// or, when you need panes or a second price scale:
import { createChart, AreaSeries } from '@arincen/charts/full';
```

Nothing changes but the import. The light build simply does not contain the code for what it leaves out — `panes` is not a method that returns empty, it is absent.

## Getting started

```js
import { createChart, AreaSeries } from '@arincen/charts';

const chart = createChart(document.getElementById('chart'), { autoSize: true });
const series = chart.addSeries(AreaSeries, { lineColor: '#2962ff', lineWidth: 2 });

series.setData([
    { time: '2026-01-01', value: 24.1 },
    { time: '2026-01-02', value: 24.8 },
]);

chart.timeScale().fitContent();
```

Or from a script tag, with no build step:

```html
<script src="https://unpkg.com/@arincen/charts/dist/arincen-charts.standalone.js"></script>
<script>
    const chart = ArincenCharts.createChart(document.getElementById('chart'));
    chart.addAreaSeries({}).setData(data);
</script>
```

## Drawing your own things

Two extension points, both of which take plain objects rather than requiring a subclass:

- **Primitives** decorate a chart that already knows how to draw itself — bands, alert lines, annotations. `series.attachPrimitive(primitive)`.
- **Custom series** replace the drawing entirely — stacked areas, heatmaps, anything with its own shape. `chart.addCustomSeries(paneView)`, full build only.

## Types

Ships `.d.ts` generated from the source, so a misspelled method is a compile error rather than a runtime surprise.

## Time is an index, not a duration

Bars are placed by their position in the data, never by elapsed time. That is what collapses weekends, holidays and overnight gaps instead of drawing empty space where a market was shut. It is the right default for market data and the wrong one for a sensor log.

## Attribution

MIT licensed, so this is a request rather than a condition — deliberately. If
Arincen Charts renders something you ship, we would appreciate either keeping
the attribution mark it shows by default, or crediting "Arincen Charts" near
the chart. No particular wording, and no link attribute asked for. Tell us and
we will list you among the products built with it.

---

Lightweight Charts™ is a trademark of TradingView, Inc. This project is not affiliated with or endorsed by TradingView. Its API is deliberately similar in places, which makes moving across easier; it is not a drop-in replacement and does not aim to be.

## About this repository

Arincen Charts is developed inside the private application it was built for —
the engine and the site that drives it change together, and splitting them
would mean the library's only real user could no longer fix it in one commit.

This repository is the published source of that work, mirrored on release. It
builds and tests on its own:

```sh
npm install
npm run build
npm test
```

Issues and discussion are welcome here. Pull requests are welcome too, though
they are applied upstream by hand rather than merged, so please open an issue
first for anything larger than a fix.
