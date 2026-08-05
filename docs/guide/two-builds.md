# Two builds

This is the unusual part of the library, so it is worth explaining rather than
just documenting.

## The problem

Most of what a financial charting library carries is **structural**: panes,
non-linear price scales, custom series, touch tracking. Most pages use none of
it — a sparkline on a news card needs a line and an axis.

Tree-shaking cannot help. Structural code lives in the core, the core genuinely
references it, and no bundler can prove that your page has only one pane or
only a linear axis. So it ships, on every page, forever.

## What we do instead

The removal happens at build time. There are two entry points, built from the
same source with a flag baked in:

| | import | size | contains |
|---|---|---|---|
| **Light** | `@arincen/charts` | ~14 KB | Six series types, crosshair, markers, price lines, primitives, pan and zoom |
| **Full** | `@arincen/charts/full` | ~17 KB | All of that, plus panes, logarithmic / percentage / indexed scales, left and overlay scales, custom series, watermarks, touch tracking, kinetic scroll |

```js
import { createChart } from '@arincen/charts';        // light
import { createChart } from '@arincen/charts/full';   // full
```

Nothing else changes. Same API, same options, same data.

## What "compiled out" means

It is not a runtime check that returns early. The code is **not in the file**.

```js
import { createChart } from '@arincen/charts';

const chart = createChart(container);

chart.panes;            // undefined — the method does not exist
chart.addCustomSeries;  // undefined
```

Searching the shipped light bundle for `priceScaleId`, `trackingMode` or
`createTextWatermark` returns nothing. That is checked on every build, along
with the size budget, which fails the build if the light bundle grows past
16 KB.

## Which should you use

Start with the light build. Move to full when you need something it does not
have — the import is the only change, and three kilobytes is a fair price for
a second price scale.

If you are unsure, use full. It is still smaller than most alternatives, and
guessing wrong costs you a few kilobytes rather than a rewrite.

## Feature detection

If you write code that must work against either build, ask:

```js
if (typeof chart.panes === 'function') {
    chart.addSeries(HistogramSeries, volumeOptions, 1);
}
```

This is how the demo gallery does it, and it is why the light build's absent
methods are `undefined` rather than throwing.
