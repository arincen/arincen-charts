# Coming from lightweight-charts

Arincen Charts is **not a drop-in replacement**, and does not aim to be. Its
API is deliberately similar in places because moving across is easier that way,
but the surface is smaller and stays smaller on purpose.

This page is a factual comparison, so you can tell quickly whether the move is
worth making.

## What is the same

Most of the everyday API. The chart below is drawn by a snippet written
against lightweight-charts — series definition, options, price line, crosshair
subscription — running here with only the import changed.

<ChartDemo :height="300">

```js
const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
});

series.setData(data.slice(-70));

series.createPriceLine({
    price: data[data.length - 1].close,
    color: '#db2777',
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: 'last',
});

chart.subscribeCrosshairMove(() => {});
chart.timeScale().fitContent();
```

</ChartDemo>

The v5 `addSeries(Definition, options, paneIndex)` form, price lines,
`update`, crosshair subscriptions and the time scale all take the shapes you
already pass them:

```js
const chart = createChart(container, options);
const series = chart.addSeries(AreaSeries, seriesOptions);

series.setData(data);
series.update(point);
series.createPriceLine({ price: 42, title: 'target' });

chart.timeScale().fitContent();
chart.subscribeCrosshairMove(handler);
```

Series primitives, custom series, panes, price scales and the crosshair modes
are the same shapes too.

## What is different

| | |
|---|---|
| **Two builds** | Structural features are compiled out of `@arincen/charts`. Import `@arincen/charts/full` for panes, custom series and non-linear scales. |
| **Series are definitions** | `addSeries(AreaSeries, …)` takes the imported object, never a string. This is what lets a chart with one area series ship without the candlestick renderer. |
| **Fewer options** | Options we have not needed are absent rather than accepted and ignored. If you pass something unknown, it does nothing. |
| **No custom horizontal scale** | Time is an index. There is no `HorzScaleBehavior` to replace it. |
| **Attribution is on by default** | `layout.attributionLogo` defaults to `true`. One option turns it off. |

## What is missing

Honestly, so you find out here rather than mid-migration:

- Custom horizontal scale behaviours
- `IChartApiBase` generics — this is JavaScript with types generated from JSDoc, not a TypeScript-first library
- Series definitions we have not written (there are six)
- Yield curve and options charts

## Size

| | |
|---|---|
| `@arincen/charts` | ~26 KB gzipped |
| `@arincen/charts/full` | ~34 KB gzipped |
| lightweight-charts v5.2 | ~60 KB gzipped |

All three measured the same way — gzip level 9 over the standalone build each
project ships. The last row is measured rather than quoted: their README says
about thirty-five kilobytes, which was true of version 4. It was taken from
v5.2 on 2026-08-12 and is not re-measured on every run, because we no longer
install their package for anything.

Ours are. A test measures both of our bundles on every run and fails if any
number written in these docs is not what the bundle actually is.

## Moving across

The import is usually the only line that changes:

```diff
- import { createChart, AreaSeries } from 'lightweight-charts';
+ import { createChart, AreaSeries } from '@arincen/charts';
```

Series definitions, `setData`, price lines, primitives, panes and the crosshair
all take the shapes you already pass them. Reach for `@arincen/charts/full`
when you need panes, custom series or a non-linear scale.

Everything on this page is measured, so you can check the claims before you
commit to anything.

---

Lightweight Charts™ is a trademark of TradingView, Inc. This project is not
affiliated with or endorsed by TradingView. Parts of this library's API
surface, and some rendering constants governing candle widths and axis tick
spacing, are modelled on lightweight-charts, which is distributed under the
Apache License 2.0.
