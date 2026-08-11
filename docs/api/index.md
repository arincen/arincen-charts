# API reference

Types are generated from the source and ship with the package, so your editor
is the fastest reference: `createChart` returns a typed object and a misspelled
method is an error where you type it.

This page is the shape of the surface. For what each thing is *for*, follow the
links into the guides.

## createChart

```ts
createChart(container: HTMLElement, options?: ChartOptions): ChartApi
```

The container must exist and should have a height. Everything else has a
default.

## ChartApi

### Series

| | |
|---|---|
| `addSeries(definition, options?, paneIndex?)` | returns a `SeriesApi` |
| `removeSeries(series)` | |
| `addCustomSeries(paneView, options?, paneIndex?)` | **full build** — [custom series](/plugins/custom-series) |

### Options and size

| | |
|---|---|
| `applyOptions(options)` | merged, not replaced |
| `options()` | the resolved tree |
| `resize(width, height)` | ignored while `autoSize` is on |
| `autoSizeActive()` | whether the observer is running |
| `paneSize(paneIndex?)` | `{ width, height }` of the plot |
| `chartElement()` | the container |
| `remove()` | canvases, listeners, observers, primitives |

### Scales

| | |
|---|---|
| `timeScale()` | [`TimeScaleApi`](#timescaleapi) |
| `priceScale(id?)` | [`PriceScaleApi`](#pricescaleapi) — `'right'`, `'left'` or your own id |

### Events

| | |
|---|---|
| `subscribeCrosshairMove(handler)` / `unsubscribeCrosshairMove(handler)` | |
| `subscribeClick(handler)` / `unsubscribeClick(handler)` | |
| `subscribeDblClick(handler)` / `unsubscribeDblClick(handler)` | |
| `setCrosshairPosition(price, time, series)` | drive it yourself |
| `clearCrosshairPosition()` | |

Handlers receive `{ time, logical, point, seriesData, hoveredSeries, hoveredObjectId, paneIndex, sourceEvent }`.
See [interaction](/guide/interaction#reacting-to-it).

### Panes — full build

| | |
|---|---|
| `panes()` | `PaneApi[]` |
| `addPane(index?)` / `removePane(index)` / `swapPanes(from, to)` | |

## PaneApi

**Full build.** See [panes](/guide/panes).

| | |
|---|---|
| `paneIndex()` | where it sits |
| `chart()` | the chart that owns it |
| `getSeries()` | every series drawn on it |
| `getHeight()` | CSS pixels, as laid out now |
| `setHeight(px)` | stored as the stretch factor that produces it |
| `getStretchFactor()` / `setStretchFactor(factor)` | the share it claims — survives a resize |
| `moveTo(index)` | reorder |
| `priceScale()` | this pane's scale |
| `attachPrimitive(p)` / `detachPrimitive(p)` | draws on the pane, not one series |
| `getHTMLElement()` | the pane's own element, for positioning your DOM over it |

### Export

| | |
|---|---|
| `takeScreenshot()` | a `<canvas>` you can turn into a PNG |

## SeriesApi

### Data

| | |
|---|---|
| `setData(points)` | replaces everything |
| `update(point)` | appends or replaces the last — [live data](/start/live-data) |
| `data()` | what is set now |
| `dataByIndex(index, direction?)` | the reading at a position |
| `barsInLogicalRange(range)` | how much of **this series** falls in a range |
| `subscribeDataChanged(handler)` / `unsubscribeDataChanged(handler)` | |

### Appearance

| | |
|---|---|
| `applyOptions(options)` / `options()` | |
| `seriesType()` | `'Line'`, `'Candlestick'`, … |
| `priceFormatter()` | the formatter this series uses |

### Annotation

| | |
|---|---|
| `setMarkers(markers)` / `markers()` | or `createSeriesMarkers` — [markers](/guide/markers) |
| `createPriceLine(options)` / `removePriceLine(line)` / `priceLines()` | |
| `attachPrimitive(primitive)` / `detachPrimitive(primitive)` | [plugins](/plugins/) |

### Position

| | |
|---|---|
| `priceScale()` | the scale this series is on |
| `priceToCoordinate(price)` / `coordinateToPrice(y)` | `null` outside the plot |
| `seriesOrder()` / `setSeriesOrder(order)` | drawing order within a pane |
| `pop()` | removes the last reading |

## TimeScaleApi

### Moving the view

| | |
|---|---|
| `fitContent()` | every reading on screen |
| `resetTimeScale()` | back to the default framing — **not** `fitContent` |
| `scrollToRealTime()` | newest bar at the right edge |
| `scrollToPosition(position, animated?)` | by offset in bars |
| `setVisibleRange({ from, to })` | by timestamp |
| `setVisibleLogicalRange({ from, to })` | by position |

### Reading it

| | |
|---|---|
| `getVisibleRange()` | `null` when the view holds no readings |
| `getVisibleLogicalRange()` | always answers |
| `scrollPosition()` | current right offset, in bars |
| `width()` / `height()` | |

### Coordinates

| | |
|---|---|
| `timeToCoordinate(time)` / `coordinateToTime(x)` | `null` outside the data |
| `logicalToCoordinate(logical)` / `coordinateToLogical(x)` | unclamped |
| `timeToIndex(time)` | position of a timestamp |

### Events

| | |
|---|---|
| `subscribeVisibleTimeRangeChange(handler)` / `unsubscribeVisibleTimeRangeChange(handler)` | |
| `subscribeVisibleLogicalRangeChange(handler)` / `unsubscribeVisibleLogicalRangeChange(handler)` | |
| `subscribeSizeChange(handler)` / `unsubscribeSizeChange(handler)` | the axis strip's own dimensions |

Every `unsubscribe…` takes the **same function reference** you subscribed with,
so an inline arrow function can never be removed. `chart.remove()` drops all of
them, which is why a component that removes its chart on teardown has nothing
else to clean up.

| | |
|---|---|
| `applyOptions(options)` / `options()` | |

The logical range is **unclamped** — it runs past either end of the data once
you zoom out, which is how you know it is time to
[load more](/recipes/infinite-history).

## PriceScaleApi

`applyOptions(options)` · `options()` · `width()` · `setAutoScale(enabled)`

See [price scales](/guide/price-scales).

## Exports

```js
import {
    createChart, createSeriesMarkers,
    LineSeries, AreaSeries, BaselineSeries,
    CandlestickSeries, BarSeries, HistogramSeries,
    LineStyle, LineType, CrosshairMode, PriceScaleMode, PriceLineSource,
} from '@arincen/charts';
```

The full build adds:

```js
import {
    LastPriceAnimationMode, FULL_BUILD,
    createTooltip, prefersReducedMotion,
    createTextWatermark, createImageWatermark, createUpDownMarkers,
} from '@arincen/charts/full';
```

| | |
|---|---|
| `createTooltip(chart, options?)` | [a tooltip that follows the crosshair](/guide/interaction#a-tooltip-without-writing-one) |
| `createTextWatermark(options)` / `createImageWatermark(url, options)` | [watermarks](/guide/watermarks) |
| `createUpDownMarkers(options)` | [up/down markers](/guide/watermarks#up-down-markers) |
| `prefersReducedMotion()` | [whether the reader has asked for less movement](/guide/interaction#movement-nobody-asked-for) |

`FULL_BUILD` is a boolean you can branch on when a component must work under
either build.

## Enums

| | |
|---|---|
| `LineStyle` | `Solid`, `Dotted`, `Dashed`, `LargeDashed`, `SparseDotted` |
| `LineType` | `Simple`, `WithSteps`, `Curved` |
| `CrosshairMode` | `Normal`, `Magnet`, `MagnetOHLC`, `Hidden` |
| `PriceScaleMode` | `Normal`, `Logarithmic`, `Percentage`, `IndexedTo100` |
| `PriceLineSource` | `LastBar`, `LastVisible` |
| `LastPriceAnimationMode` | `Disabled`, `Continuous`, `OnDataUpdate` — full build |

## Series definitions

`addSeries` takes the imported object, never a string:

```js
chart.addSeries(LineSeries, { color: '#db2777' });      // ✅
chart.addSeries('Line', { color: '#db2777' });          // ❌
```

That is what lets a bundler prove `CandlestickSeries` is unused and leave it
out of your build.
