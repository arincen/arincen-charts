# Series

Six types. Import the one you need — that is what lets a chart with a single
area series ship without the candlestick renderer.

```js
import {
    LineSeries, AreaSeries, BaselineSeries,
    CandlestickSeries, BarSeries, HistogramSeries,
} from '@arincen/charts';
```

## Line

```js
chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2 });
```

## Area

```js
chart.addSeries(AreaSeries, {
    lineColor: '#2962ff',
    topColor: 'rgba(41, 98, 255, 0.28)',
    bottomColor: 'rgba(41, 98, 255, 0)',
});
```

Set `invertFilledArea: true` to fill upward instead.

## Baseline

Filled and stroked differently above and below a price:

```js
chart.addSeries(BaselineSeries, {
    baseValue: { type: 'price', price: 25 },
    topLineColor: 'rgba(38, 166, 154, 1)',
    bottomLineColor: 'rgba(239, 83, 80, 1)',
});
```

## Candlestick

```js
chart.addSeries(CandlestickSeries, {
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: true,
    wickVisible: true,
});
```

Takes `open`, `high`, `low`, `close`. Candle width follows bar spacing, and the
border is drawn *inside* the body — which is why candles keep a gap between
them at daily density instead of fusing into a band.

## Bar

```js
chart.addSeries(BarSeries, { upColor: '#26a69a', thinBars: true });
```

## Histogram

```js
chart.addSeries(HistogramSeries, { color: '#8b95a8', base: 0 });
```

`base` is on the axis whether or not a bar reaches it, so volume bars stand on
a zero line rather than being cut off. Per-point `color` overrides the series
colour.

## Common options

| option | default | |
|---|---|---|
| `visible` | `true` | |
| `title` | `''` | drawn as a tag against the price axis |
| `priceLineVisible` | `true` | dashed line at the last value |
| `lastValueVisible` | `true` | badge on the axis |
| `priceFormat` | — | `{ type, precision, minMove }` |
| `priceScaleId` | `'right'` | full build; see [Price scales](/guide/price-scales) |
| `autoscaleInfoProvider` | — | full build; override the range this series asks for |

### priceFormat

```js
{ priceFormat: { type: 'price', precision: 2, minMove: 0.25 } }
```

`minMove` is the tick size, and rounding happens **before** the decimals are
fixed — an instrument quoted in quarters reads 63.25 and 63.50, never 63.31.

`type: 'volume'` abbreviates (12.50K, 3.40M), `type: 'percent'` appends a sign.

## Markers

```js
import { createSeriesMarkers } from '@arincen/charts';

createSeriesMarkers(series, [
    { time: '2026-03-01', position: 'belowBar', shape: 'arrowUp', color: '#22ab94', text: 'Buy' },
]);
```

`position` is `aboveBar`, `belowBar` or `inBar`; `shape` is `arrowUp`,
`arrowDown`, `circle` or `square`. The price range reserves room for them, so
a marker on the highest bar is not clipped.

## Price lines

```js
const line = series.createPriceLine({
    price: 26.4,
    color: '#f23645',
    lineStyle: 2,
    title: 'alert',
    axisLabelVisible: true,
});

series.removePriceLine(line);
```

A price line sits on the series' own scale, and its axis badge takes priority
over tick labels behind it — but never over the last value, because the number
that moves is the one that has to stay readable.
