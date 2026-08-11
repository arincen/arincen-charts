# Markers and price lines

Three ways to annotate a series, and they are not interchangeable.

| | attached to | moves when |
|---|---|---|
| **Marker** | a moment in the data | that bar moves |
| **Price line** | a price | never — it is horizontal, forever |
| **Last value label** | the newest reading | every update |

A "buy here" belongs on a marker. A stop-loss belongs on a price line. Getting
this backwards is how a stop-loss ends up drifting with the chart.

## Markers

```js
import { createSeriesMarkers } from '@arincen/charts';

const markers = createSeriesMarkers(series, [
    { time: 1704067200, position: 'aboveBar', shape: 'arrowDown', color: '#f23645', text: 'sell' },
    { time: 1704758400, position: 'belowBar', shape: 'arrowUp', color: '#22ab94', text: 'buy' },
]);
```

<ChartDemo :height="320">

```js
const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
});

const bars = data.slice(-70);

series.setData(bars);

createSeriesMarkers(series, [
    { time: bars[12].time, position: 'belowBar', shape: 'arrowUp', color: '#22ab94', text: 'buy' },
    { time: bars[34].time, position: 'aboveBar', shape: 'arrowDown', color: '#f23645', text: 'sell' },
    { time: bars[50].time, position: 'inBar', shape: 'circle', color: '#db2777', text: 'split' },
]);

chart.timeScale().fitContent();
```

</ChartDemo>

| field | values |
|---|---|
| `time` | must exist in the series' data |
| `position` | `aboveBar`, `belowBar`, `inBar` |
| `shape` | `circle`, `square`, `arrowUp`, `arrowDown` |
| `color` | any CSS colour |
| `text` | optional label beside the shape |
| `size` | optional multiplier, default `1` |

The handle it returns is how you change them later:

```js
markers.setMarkers(next);   // replaces the lot
markers.markers();          // what is set now
markers.detach();           // remove them entirely
```

**Markers are replaced, never appended.** To add one, pass the old array plus
the new entry — `markers.setMarkers([...markers.markers(), extra])`.

::: warning A marker on a time that is not in the data does not draw
It is not an error, and nothing is logged, because a marker arriving before its
bar is normal in a live feed. If a marker is missing, check its `time` against
the data before checking anything else.
:::

### Why markers stay legible

Every marker is outlined in the chart's own background colour before it is
filled. A marker sits on top of the very bars it is pointing at, and a red
arrow over a red candle is a shape nobody can find — the ring gives it an edge
against whatever is behind it, in any theme, without a second colour to
configure.

Nothing to switch on, and nothing to switch off. On a chart with a transparent
background there is nothing to outline *with*, so it is skipped rather than
guessed at: a white ring would be wrong on somebody's dark page.

`series.setMarkers(…)` exists as well and does the same thing. Prefer
`createSeriesMarkers` — the handle it hands back is what you need when the
markers have to change, and reaching back through the series to replace them
is more code for the same result.

## Price lines

```js
const line = series.createPriceLine({
    price: 128.50,
    color: '#db2777',
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: 'target',
});
```

<ChartDemo :height="320">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.24)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);

const high = Math.max(...values.map((point) => point.value));
const low = Math.min(...values.map((point) => point.value));

series.createPriceLine({
    price: high,
    color: '#22ab94',
    lineStyle: LineStyle.Dashed,
    title: 'high',
});

series.createPriceLine({
    price: low,
    color: '#f23645',
    lineStyle: LineStyle.Dashed,
    title: 'low',
});

chart.timeScale().fitContent();
```

</ChartDemo>

| option | default | |
|---|---|---|
| `price` | — | required |
| `color` | series colour | |
| `lineWidth` | `1` | |
| `lineStyle` | `Solid` | see [line styles](#line-styles) |
| `lineVisible` | `true` | `false` gives an axis label and no rule |
| `axisLabelVisible` | `true` | the tag on the price scale |
| `axisLabelColor` / `axisLabelTextColor` | from `color` | |
| `title` | `''` | drawn at the left end of the line |

They are live objects:

```js
line.applyOptions({ price: 131.00, title: 'target ↑' });
series.removePriceLine(line);
series.priceLines();   // every line on this series
```

A trailing stop is `applyOptions({ price })` on each tick — cheaper than
removing and recreating, and it will not flicker.

## The last value label

Every series draws one by default: a tag on the price scale showing the newest
reading, plus a dashed rule across the plot.

```js
series.applyOptions({
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineColor: '#db2777',
    priceLineWidth: 1,
    priceLineStyle: LineStyle.Dashed,
    priceLineSource: PriceLineSource.LastBar,
});
```

`priceLineSource` decides what "last" means when the chart is scrolled back:

- `LastBar` — the newest reading in the data, on screen or not
- `LastVisible` — the newest reading currently visible

`LastBar` is the default and is usually right: the reader scrolled back to look
at history, and the current price is still the current price.

**Turn both off for anything but the primary series.** Four series each drawing
their own dashed rule is four rules across the plot and four tags fighting for
the same strip of axis.

```js
chart.addSeries(LineSeries, { priceLineVisible: false, lastValueVisible: false });
```

### The shape of a badge

A price badge is a tag with a point on the plot-facing edge, not a rectangle
butted against the axis. A rectangle says only "this number belongs to this
axis"; the point answers the question a reader actually has when two badges sit
close together and one of them is the live price — *which line is this?*

The point tracks the price rather than sitting at the badge's centre. A badge
near the top or bottom of a pane is nudged inward to stay whole, and a centred
point would then aim a few pixels off the level it names — visibly wrong exactly
where the last price sits on a chart that has been scrolled back.

The [time label](/guide/time-scale) is the same shape rotated: rounded, with a
point on its top edge aiming at the column it names.

## Line styles

```js
import { LineStyle } from '@arincen/charts';
```

`Solid` · `Dotted` · `Dashed` · `LargeDashed` · `SparseDotted`

The same five apply to price lines, grid lines, the crosshair and the baseline.

## A pulsing last price

Full build only, and worth it on a live chart:

```js
import { LastPriceAnimationMode } from '@arincen/charts/full';

series.applyOptions({ lastPriceAnimation: LastPriceAnimationMode.OnDataUpdate });
```

| mode | |
|---|---|
| `Disabled` | nothing — the default |
| `Continuous` | pulses forever |
| `OnDataUpdate` | one pulse each time a reading arrives |

`OnDataUpdate` is the one to use. A ring that never stops is a ring the reader
stops seeing after a minute; a ring that fires on arrival tells them something
happened.

## Drawing something none of these draw

Markers and price lines cover the annotations most charts need. When yours is
not among them — a shaded session, a trend line the reader can drag, a band
between two series — that is a [primitive](/plugins/), and it draws on the same
canvas with the same coordinates.

## What next

- [What a plugin is](/plugins/) — when these three are not enough
- [Crosshair and interaction](/guide/interaction) — reacting to what is hovered
- [Series options in full](/guide/series)
