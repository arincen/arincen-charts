# Price scales

::: tip Full build only
A second scale and non-linear modes are in `@arincen/charts/full`. The light
build has one linear scale on the right.
:::

## Modes

```js
import { PriceScaleMode } from '@arincen/charts/full';

createChart(container, {
    rightPriceScale: { mode: PriceScaleMode.Logarithmic },
});
```

| mode | |
|---|---|
| `Normal` | linear |
| `Logarithmic` | equal ratios take equal height |
| `Percentage` | move from the first visible value, in per cent |
| `IndexedTo100` | the same move, restated as an index from 100 |

Percentage and indexed are the same mapping — one is the other plus a hundred —
so they differ only in the label.

## A second scale

A series picks its scale by id:

```js
chart.addSeries(LineSeries, { color: '#2962ff' });                        // right
chart.addSeries(LineSeries, { color: '#e5395f', priceScaleId: 'left' });  // left
```

`'right'` is the default. `'left'` draws an axis in the other gutter. **Any
other id is an overlay**: it scales its own series and draws no axis at all,
which is how a volume histogram sits under a price chart without a second
gutter or a second pane.

```js
const volume = chart.addSeries(HistogramSeries, {
    priceScaleId: 'volume',
    priceLineVisible: false,
});

volume.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
```

Each scale autoscales against **only the series drawn on it**, which is the
entire point of having more than one.

## Margins

```js
{ scaleMargins: { top: 0.2, bottom: 0.1 } }
```

Fractions of the pane's height kept clear above and below the data. Raising
`top` is how you push a series down to make room for something else.

## Reaching a scale

```js
chart.priceScale();          // the default, right-hand scale
chart.priceScale('left');
series.priceScale();         // whichever scale that series is on
```

All three return the same shape: `applyOptions`, `options`, `width`,
`setAutoScale`.

## Manual ranges

Dragging an axis, or calling `setAutoScale(false)`, pins the range until you
hand it back:

```js
series.priceScale().setAutoScale(true);
```

Double-clicking an axis does the same thing, and affects only that axis.
