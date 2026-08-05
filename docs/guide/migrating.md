# Coming from lightweight-charts

Arincen Charts is **not a drop-in replacement**, and does not aim to be. Its
API is deliberately similar in places because moving across is easier that way,
but the surface is smaller and stays smaller on purpose.

This page is a factual comparison, so you can tell quickly whether the move is
worth making.

## What is the same

Most of the everyday API:

```js
const chart = createChart(container, options);
const series = chart.addSeries(AreaSeries, seriesOptions);

series.setData(data);
series.update(point);
series.createPriceLine({ price: 42, title: 'target' });

chart.timeScale().fitContent();
chart.subscribeCrosshairMove(handler);
```

The v5 `addSeries(Definition, options, paneIndex)` form, series primitives,
custom series, panes, price scales and the crosshair modes all take the same
shapes.

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
| `@arincen/charts` | ~14 KB gzipped |
| `@arincen/charts/full` | ~17 KB gzipped |
| lightweight-charts v5 | ~35 KB gzipped |

Measured the same way, on the standalone builds, both checked by a size budget
that fails the build.

## Should you move

**Probably not, if** lightweight-charts is working for you and its size is not
a problem. It is a mature library with a large user base and features we do not
have.

**Worth trying, if** you ship a chart on a page where 35 KB is a real cost, you
have many pages with simple charts, or you want the structural features
compiled out rather than shipped and unused.

---

Lightweight Charts™ is a trademark of TradingView, Inc. This project is not
affiliated with or endorsed by TradingView. Parts of this library's API
surface, and some rendering constants governing candle widths and axis tick
spacing, are modelled on lightweight-charts, which is distributed under the
Apache License 2.0.
