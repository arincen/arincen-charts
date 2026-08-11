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
| **Light** | `@arincen/charts` | ~26 KB | Six series types, crosshair, markers, price lines, primitives, pan and zoom |
| **Full** | `@arincen/charts/full` | ~34 KB | All of that, plus panes, logarithmic / percentage / indexed scales, left and overlay scales, custom series, watermarks, touch tracking, kinetic scroll |

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
`createTextWatermark` returns nothing. That is checked by the test suite, along
with the size budget, which fails if the light bundle grows past 26 KB.

## Which should you use

Start with the light build. Move to full when you need something it does not
have — the import is the only change, and three kilobytes is a fair price for
a second price scale.

If you are unsure, use full. It is still smaller than most alternatives, and
guessing wrong costs you a few kilobytes rather than a rewrite.

## The chart's own lifecycle

Everything above is about what a chart contains. This is the chart itself:
made, measured, exported and disposed of. The demo builds a **second** chart
inside the first one's box, so `createChart` and `remove` are things you can
watch rather than read about.

<ChartDemo :height="360">

```js
chart.addSeries(LineSeries, { color: '#d4d4d4', lineWidth: 1 })
    .setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();

// A panel to build a second, independent chart in.
const panel = document.createElement('div');

panel.style.cssText = 'position:absolute;right:14px;top:14px;width:46%;height:150px;z-index:3;'
    + 'border:1px solid #d4d4d4;border-radius:10px;overflow:hidden;background:#fff';
container.appendChild(panel);

const bar = document.createElement('div');

bar.style.cssText = 'position:absolute;left:14px;bottom:38px;z-index:3;display:flex;gap:6px;flex-wrap:wrap';
container.appendChild(bar);

const out = document.createElement('div');

out.style.cssText = 'position:absolute;left:14px;bottom:8px;z-index:3;'
    + 'font:11px/1.6 ui-monospace,monospace;color:#737373';
container.appendChild(out);

let second = null;

const report = () => {
    out.innerHTML = second
        ? `second chart: autoSizeActive ${second.autoSizeActive()}`
            + `  ·  paneSize ${JSON.stringify(second.paneSize())}`
            + `  ·  element ${second.chartElement() === panel ? 'panel' : '?'}`
            + `  ·  FULL_BUILD ${FULL_BUILD}`
        : 'second chart: removed';
};

const button = (label, run) => {
    const element = document.createElement('button');

    element.textContent = label;
    element.style.cssText = 'padding:4px 9px;border:1px solid #d4d4d4;border-radius:8px;'
        + 'background:#fff;color:#0a0a0a;font:600 11px system-ui;cursor:pointer';
    element.onclick = () => { run(); report(); };
    bar.appendChild(element);
};

const build = () => {
    if (second) {
        return;
    }

    // A chart of its own, sized by a ResizeObserver on the panel.
    second = createChart(panel, {
        autoSize: true,
        layout: { attributionLogo: false, background: { type: 'solid', color: 'transparent' } },
        timeScale: { visible: false },
        rightPriceScale: { visible: false },
    });

    second.addSeries(AreaSeries, {
        lineColor: '#db2777',
        topColor: 'rgba(192, 38, 211, 0.28)',
        bottomColor: 'rgba(234, 88, 12, 0.02)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    }).setData(data.slice(-70).map((point) => ({ time: point.time, value: point.value })));

    second.timeScale().fitContent();
};

button('createChart', build);
button('resize(300, 110)', () => {
    // Ignored while autoSize is on — which is the point of autoSizeActive.
    second?.resize(300, 110);
});
button('takeScreenshot → tab', () => {
    const canvas = second?.takeScreenshot();

    if (canvas) {
        window.open()?.document.write(`<img src="${canvas.toDataURL()}">`);
    }
});
button('remove', () => {
    second?.remove();
    second = null;
});

build();
report();

onCleanup(() => second?.remove());
```

</ChartDemo>

`takeScreenshot()` returns a `<canvas>` holding both layers flattened — the
data and the crosshair — so `toDataURL()` or `toBlob()` on it is a PNG of
exactly what the reader is looking at.

`resize()` does nothing while `autoSize` is on, which is what `autoSizeActive()`
is for: it tells you whether the observer is running and therefore whether your
`resize` call means anything.

`remove()` drops the canvases, the observer, every listener, and tells any
primitive to release what it was holding. **Nothing else is required** — there
is no separate teardown for series, scales or subscriptions.

## Feature detection

If you write code that must work against either build, ask:

```js
if (typeof chart.panes === 'function') {
    chart.addSeries(HistogramSeries, volumeOptions, 1);
}
```

This is how the demo gallery does it, and it is why the light build's absent
methods are `undefined` rather than throwing.
