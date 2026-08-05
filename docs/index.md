---
layout: home

hero:
  name: Arincen Charts
  text: Financial charts in 14 KB
  tagline: A canvas charting engine with zero dependencies, in two builds — one that carries everything, and one that has the rest compiled out.
  actions:
    - theme: brand
      text: Get started
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/arincen/arincen-charts

features:
  - title: 14 KB, and the build proves it
    details: The bundle fails to build if it grows past its budget. The number in the heading is checked on every commit rather than measured once and repeated.
  - title: No dependencies
    details: Nothing in `dependencies` to audit, update, or have a CVE filed against. The whole library is one file with no imports outside itself.
  - title: Two builds, one codebase
    details: Panes, non-linear price scales and custom series are compiled out of the light build entirely. Not tree-shaken and hopefully removed — absent.
  - title: Extensible without forking
    details: Primitives draw over a chart that already works. Custom series replace the drawing entirely. Both take plain objects, and neither needs a subclass.
---

## In thirty seconds

```js
import { createChart, AreaSeries } from '@arincen/charts';

const chart = createChart(document.getElementById('chart'), { autoSize: true });
const series = chart.addSeries(AreaSeries, { lineColor: '#2962ff', lineWidth: 2 });

series.setData([
    { time: '2026-01-01', value: 24.10 },
    { time: '2026-01-02', value: 24.83 },
    { time: '2026-01-05', value: 24.41 },
]);

chart.timeScale().fitContent();
```

Note the third data point. The gap over the weekend is not drawn as empty space — bars are placed by their position in the data, never by elapsed time. That is the right default for market data, and the wrong one for a sensor log.

## Why another charting library

Because most of what a financial charting library carries, most pages never use. Panes, logarithmic scales, custom series and touch tracking are all real features and all structural, which means a bundler cannot remove them: the core genuinely references them, and nothing can prove your page has only one pane.

So the removal happens earlier, at build time. `@arincen/charts` does not contain the code for what it leaves out. `chart.panes` is not a method that returns an empty array — it does not exist.

That is the whole idea. Everything else is a charting library.
