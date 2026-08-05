# API reference

Types are generated from the source and shipped with the package, so your
editor is the fastest reference: `createChart` returns a typed object, and a
misspelled method is a compile error rather than a runtime surprise.

This page covers the shape of the surface. For options in detail, see the
guides.

## createChart

```js
createChart(container: HTMLElement, options?: ChartOptions): ChartApi
```

## ChartApi

| | |
|---|---|
| `addSeries(definition, options?, paneIndex?)` | returns a `SeriesApi` |
| `removeSeries(series)` | |
| `applyOptions(options)` | merged, not replaced |
| `options()` | |
| `resize(width, height)` | |
| `remove()` | element, listeners and observers |
| `timeScale()` | `TimeScaleApi` |
| `priceScale(id?)` | `PriceScaleApi` |
| `subscribeCrosshairMove(handler)` / `unsubscribe…` | |
| `subscribeClick(handler)` / `unsubscribe…` | |
| `takeScreenshot()` | a `<canvas>` you can export |
| `chartElement()` | |

Full build only:

| | |
|---|---|
| `addCustomSeries(paneView, options?, paneIndex?)` | |
| `panes()` | `PaneApi[]` |
| `addPane(index?)` / `removePane(index)` / `swapPanes(from, to)` | |

## SeriesApi

| | |
|---|---|
| `setData(points)` / `update(point)` / `data()` | |
| `applyOptions(options)` / `options()` | |
| `setMarkers(markers)` / `markers()` | |
| `attachPrimitive(p)` / `detachPrimitive(p)` | |
| `createPriceLine(options)` / `removePriceLine(line)` / `priceLines()` | |
| `priceScale()` | the scale this series is on |
| `priceToCoordinate(price)` / `coordinateToPrice(y)` | |
| `seriesType()` | |

## TimeScaleApi

| | |
|---|---|
| `fitContent()` | |
| `applyOptions(options)` / `options()` | |
| `scrollToRealTime()` | |
| `getVisibleRange()` / `getVisibleLogicalRange()` | |
| `timeToCoordinate(time)` / `coordinateToTime(x)` | |
| `width()` | |
| `subscribeVisibleLogicalRangeChange(handler)` / `unsubscribe…` | |
| `subscribeVisibleTimeRangeChange(handler)` / `unsubscribe…` | |

The logical range is **unclamped** — it runs past either end of the data once
you zoom out, which is how you know the viewport has left the data and it is
time to load more.

## PriceScaleApi

`applyOptions(options)` · `options()` · `width()` · `setAutoScale(enabled)`

## Enums

```js
import { LineStyle, CrosshairMode, PriceScaleMode } from '@arincen/charts';
```

- `LineStyle` — `Solid`, `Dotted`, `Dashed`, `LargeDashed`, `SparseDotted`
- `CrosshairMode` — `Normal`, `Magnet`, `Hidden`, `MagnetOHLC`
- `PriceScaleMode` — `Normal`, `Logarithmic`, `Percentage`, `IndexedTo100`
