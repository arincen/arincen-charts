---
layout: home

hero:
  name: Arincen Charts
  text: Financial charts an AI agent can read
  tagline: 22 KB, zero dependencies, and the first charting engine that hands a model exactly what is on screen — then draws its answer back onto the chart.
  actions:
    - theme: brand
      text: Get started
      link: /start/
    - theme: alt
      text: View on GitHub
      link: https://github.com/arincen/arincen-charts

features:
  - title: An agent can read it
    details: chart.toText() hands a model exactly what is on screen, in words. chart.toImage() hands it the picture. chart.annotate() draws the answer back. No API key, no bundled model, no provider to be tied to.
  - title: 22 KB, and it is measured
    details: A test gzips the shipped bundle and fails if any size written anywhere on this site is not the one it measured. That heading drifted four kilobytes before the test existed.
  - title: No dependencies
    details: Nothing to audit, update, or have a CVE filed against. The whole library is one file with no imports outside itself.
  - title: Two builds, one codebase
    details: Panes, non-linear price scales and custom series are compiled out of the light build entirely. Not tree-shaken and hopefully removed — absent.
  - title: Extensible without forking
    details: Primitives draw over a chart that already works. Custom series replace the drawing entirely. Both take plain objects, and neither needs a subclass.
---

## In thirty seconds

<ChartDemo :height="280">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.3)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

series.setData([
    { time: '2026-01-01', value: 24.10 },
    { time: '2026-01-02', value: 24.83 },
    { time: '2026-01-05', value: 24.41 },
    { time: '2026-01-06', value: 25.02 },
    { time: '2026-01-07', value: 24.77 },
]);

chart.timeScale().fitContent();
```

</ChartDemo>

With the two lines that make it a page rather than a snippet:

```js
import { createChart, AreaSeries } from '@arincen/charts';

const chart = createChart(document.getElementById('chart'), { autoSize: true });
```

Note the third and fourth readings — the 5th follows the 2nd. The weekend is not drawn as empty space, because bars are placed by their position in the data and never by elapsed time. That is the right default for market data and the wrong one for a sensor log.

## A chart an agent can read

Every charting library draws for eyes. Anything else — a language model, a
screen reader, an alerting job — has to reach into series internals and write
the same summary again, badly, in every project.

```js
chart.toText();
```

```
A chart of 2 series over 180 readings, 2024-01-01 to 2024-06-28.
Showing 2024-04-01 to 2024-06-28, 89 of them.
AAPL (candlestick): last 142.56, high 150.10 on 2024-06-20, low 98.20 on 2024-04-03, up 12.42% over the period.
```

Deterministic, short enough to paste into a prompt, and free of judgement —
no "bullish", no "resistance". A test fails the build if those words appear,
because a conclusion about somebody else's money is theirs to draw.

The answer comes back the same way. One shape, whatever it means: a point
becomes a marker, a level a price line, a region a shaded band.

```js
chart.annotate([
    { from, to, text },      // "steepest run"
    { time, price, text },   // "high"
    { price, text },         // "peak close"
]);
```

**There is no model in here, and there never will be.** No API key, no client
library, no provider you are tied to. What was missing everywhere else is the
boring half — getting the numbers *out* in a form something can reason about,
and getting an answer *back* onto the canvas.

[The whole loop, with a chart you can press](/recipes/ai).

## Why another charting library

Because most of what a financial charting library carries, most pages never use. Panes, logarithmic scales, custom series and touch tracking are all real features and all structural, which means a bundler cannot remove them: the core genuinely references them, and nothing can prove your page has only one pane.

So the removal happens earlier, at build time. `@arincen/charts` does not contain the code for what it leaves out. `chart.panes` is not a method that returns an empty array — it does not exist.

That is the whole idea. Everything else is a charting library.
