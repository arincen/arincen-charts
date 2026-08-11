---
layout: home

hero:
  name: Arincen Charts
  text: Financial charts in 20 KB
  tagline: A canvas charting engine with zero dependencies, in two builds — one that carries everything, and one that has the rest compiled out.
  actions:
    - theme: brand
      text: Get started
      link: /start/
    - theme: alt
      text: View on GitHub
      link: https://github.com/arincen/arincen-charts

features:
  - title: 20 KB, and it is measured
    details: A test gzips the shipped bundle and fails if any size written anywhere on this site is not the one it measured. That heading drifted four kilobytes before the test existed.
  - title: No dependencies
    details: Nothing in `dependencies` to audit, update, or have a CVE filed against. The whole library is one file with no imports outside itself.
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

## Why another charting library

Because most of what a financial charting library carries, most pages never use. Panes, logarithmic scales, custom series and touch tracking are all real features and all structural, which means a bundler cannot remove them: the core genuinely references them, and nothing can prove your page has only one pane.

So the removal happens earlier, at build time. `@arincen/charts` does not contain the code for what it leaves out. `chart.panes` is not a method that returns an empty array — it does not exist.

That is the whole idea. Everything else is a charting library.
