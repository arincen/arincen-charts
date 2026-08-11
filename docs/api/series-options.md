# Series options

Every option every series takes, with its default. The first table applies to
all seven; the rest are per type.

```js
const series = chart.addSeries(LineSeries, { /* any of the below */ });

series.applyOptions({ /* merged */ });
series.options();
```

## Common to every series

| option | default | |
|---|---|---|
| `visible` | `true` | hide without removing — the data stays loaded |
| `title` | `''` | a tag drawn against the price axis |
| `priceScaleId` | `'right'` | **full build** — [price scales](/guide/price-scales) |
| `priceFormat` | see [below](#priceformat) | how numbers are written |
| `autoscaleInfoProvider` | — | **full build** — [override the range](#autoscaleinfoprovider) |

### The last value

| option | default | |
|---|---|---|
| `lastValueVisible` | `true` | the badge on the price axis |
| `priceLineVisible` | `true` | the dashed rule across the plot |
| `priceLineColor` | `''` | empty means the series' own colour |
| `priceLineWidth` | `1` | |
| `priceLineStyle` | `LineStyle.Dashed` | |
| `priceLineSource` | `PriceLineSource.LastBar` | or `LastVisible` |
| `lastPriceAnimation` | `LastPriceAnimationMode.Disabled` | **full build** |

Turn `lastValueVisible` and `priceLineVisible` off on every series but the
primary one. Four series each drawing a rule is four rules across the plot.
[More](/guide/markers#the-last-value-label).

Every one of those set at once, including the pulse:

<ChartDemo :height="300">

```js
const series = chart.addSeries(LineSeries, {
    color: '#db2777',
    lineWidth: 2,
    title: 'ARN',
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineColor: '#c026d3',
    priceLineWidth: 2,
    priceLineStyle: LineStyle.LargeDashed,

    // What "last" means when the reader has scrolled back: the newest reading
    // in the data, rather than the newest one on screen.
    priceLineSource: PriceLineSource.LastBar,

    // One ring each time a reading arrives. Full build only.
    lastPriceAnimation: LastPriceAnimationMode.OnDataUpdate,
});

const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);
chart.timeScale().fitContent();

// So the animation has something to animate.
let last = values[values.length - 1];

const feed = setInterval(() => {
    last = { time: last.time + 86400, value: last.value + (Math.random() - 0.5) * 2 };
    series.update(last);
}, 1200);

onCleanup(() => clearInterval(feed));
```

</ChartDemo>

Scroll back a few bars: the dashed rule stays at the newest price rather than
following the last bar you can see. Set `priceLineSource:
PriceLineSource.LastVisible` for the other behaviour.

### The crosshair marker

The dot drawn on the series where the crosshair meets it.

| option | default | |
|---|---|---|
| `crosshairMarkerVisible` | `true` | |
| `crosshairMarkerRadius` | `5` | CSS pixels |
| `crosshairMarkerBorderColor` | `''` | empty means the series' colour |
| `crosshairMarkerBackgroundColor` | `''` | empty means the series' colour |
| `crosshairMarkerBorderWidth` | `2` | |

A larger radius with a background matching the chart background gives the
hollow ring many trading UIs use:

```js
series.applyOptions({
    crosshairMarkerRadius: 6,
    crosshairMarkerBackgroundColor: '#ffffff',
    crosshairMarkerBorderWidth: 2,
});
```

Set `crosshairMarkerVisible: false` on a volume histogram — a dot on a bar
chart marks nothing useful and covers the bar it lands on.

Hover the two lines: a hollow ring on the top one, nothing on the bottom.

<ChartDemo :height="300">

```js
const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

chart.addSeries(LineSeries, {
    color: '#db2777',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 7,
    crosshairMarkerBorderColor: '#db2777',
    crosshairMarkerBackgroundColor: '#ffffff',
    crosshairMarkerBorderWidth: 3,
}).setData(values);

chart.addSeries(LineSeries, {
    color: '#0891b2',
    lineWidth: 2,
    crosshairMarkerVisible: false,
    priceLineVisible: false,
    lastValueVisible: false,
}).setData(values.map((point) => ({ time: point.time, value: point.value - 8 })));

chart.timeScale().fitContent();
```

</ChartDemo>

### The base line

Not the [baseline series](#baselineseries). This is the horizontal rule at zero
drawn when a series is on a **percentage** or **indexed** price scale, marking
"no change".

| option | default | |
|---|---|---|
| `baseLineVisible` | `true` | |
| `baseLineColor` | `'#a3a3a3'` | |
| `baseLineWidth` | `1` | |
| `baseLineStyle` | `LineStyle.Solid` | |

It draws only in `PriceScaleMode.Percentage` and `IndexedTo100`. On a normal
scale these four options are set and do nothing, which is why people set them
and see no change.

Percentage mode, with the zero line styled — the pink dashes are the base line:

<ChartDemo :height="300">

```js
chart.addSeries(LineSeries, {
    color: '#db2777',
    lineWidth: 2,
    baseLineVisible: true,
    baseLineColor: '#c026d3',
    baseLineWidth: 2,
    baseLineStyle: LineStyle.Dashed,
}).setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

// Without this the four options above are accepted and draw nothing.
chart.priceScale('right').applyOptions({ mode: PriceScaleMode.Percentage });
chart.timeScale().fitContent();
```

</ChartDemo>

### priceFormat

```js
{ priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }
```

| field | |
|---|---|
| `type` | `'price'`, `'volume'`, `'percent'`, or `'custom'` |
| `precision` | decimal places |
| `minMove` | the tick size |
| `formatter` | with `type: 'custom'`, `(price) => string` |

`minMove` is the tick size and rounding happens **before** the decimals are
fixed, so an instrument quoted in quarters reads `63.25` and `63.50`, never
`63.31`:

```js
{ priceFormat: { type: 'price', precision: 2, minMove: 0.25 } }
```

`'volume'` abbreviates — `12.50K`, `3.40M`. `'percent'` appends a sign.
`'custom'` takes your own function and overrides everything else.

### autoscaleInfoProvider

**Full build.** Change the price range this series asks the scale for:

```js
series.applyOptions({
    autoscaleInfoProvider: (basis) => {
        const range = basis();

        if (! range) {
            return null;
        }

        return {
            priceRange: range.priceRange,
            margins: { above: 20, below: 20 },   // extra pixels
        };
    },
});
```

You are handed a function returning what the series would have asked for. Call
it, adjust, return. Return `null` to take no part in autoscale at all.

::: warning Do not derive the range from the current range
Widening whatever is currently displayed feeds the result back in on the next
frame and the chart zooms out forever. Base it on `basis()` or on your own
numbers. Same trap as
[primitives](/plugins/hit-testing#contributing-to-the-price-range).
:::

## LineSeries

| option | default | |
|---|---|---|
| `color` | `'#db2777'` | |
| `lineWidth` | `3` | |
| `lineStyle` | `LineStyle.Solid` | |
| `lineType` | `LineType.Simple` | `WithSteps`, `Curved` — [which](/start/choosing-a-series#line) |
| `pointMarkersVisible` | `false` | **full build** — a dot per reading |
| `pointMarkersRadius` | — | **full build**; defaults to `max(2, lineWidth + 1)` |

Point markers are for sparse data — a dozen readings where the dots say "these
are the measurements" and the line only joins them. On dense data they merge
into a thicker line.

<ChartDemo :height="260">

```js
// Fourteen readings: few enough that the dots mean something.
const sparse = data.filter((bar, index) => index % 13 === 0)
    .map((bar) => ({ time: bar.time, value: bar.value }));

chart.addSeries(LineSeries, {
    color: '#db2777',
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    lineType: LineType.Simple,
    pointMarkersVisible: true,
    pointMarkersRadius: 5,
}).setData(sparse);

chart.timeScale().fitContent();
```

</ChartDemo>

## AreaSeries

| option | default | |
|---|---|---|
| `lineColor` | `'#db2777'` | |
| `topColor` | `'rgba(219, 39, 119, 0.28)'` | fill at the top of the range |
| `bottomColor` | `'rgba(219, 39, 119, 0.02)'` | fill at the bottom |
| `invertFilledArea` | `false` | fill upwards from the line instead |
| `tintAxes` | `false` | carry the fill into the price and time axis strips |
| `lineWidth` | `3` | |
| `lineStyle` | `LineStyle.Solid` | |
| `lineType` | `LineType.Simple` | |
| `pointMarkersVisible` | `false` | **full build** |
| `pointMarkersRadius` | — | **full build** |

The fill is a vertical gradient from `topColor` to `bottomColor` across the
pane, not across the shape — so the colour at a given height is the same
wherever the line is, which keeps it stable while the chart is panned.

`invertFilledArea` fills from the line to the top of the pane. Use it when the
series is a ceiling rather than a quantity — a resistance band, a cap.

<ChartDemo :height="260">

```js
chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.3)',
    bottomColor: 'rgba(192, 38, 211, 0.02)',
    lineWidth: 2,
    invertFilledArea: true,      // fills upward, not down
}).setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();
```

</ChartDemo>

### `tintAxes`

The fill stops dead at the gutter, so a chart reads as a coloured middle with
two grey strips bolted either side. With this on it continues into both: the
whole thing becomes one coloured object.

<ChartDemo :height="300">

```js
chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.34)',
    bottomColor: 'rgba(234, 88, 12, 0.03)',
    lineWidth: 2,

    // The dress continues past the plot.
    tintAxes: true,
}).setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();
```

</ChartDemo>

One gradient paints both strips, running from the top of the plot to the bottom
of the chart, so a strip carries whatever colour the fill would have had there.
Two gradients — or an extra wash over one — make it a near-match rather than a
continuation, and the seam lands on the one edge the effect exists to remove.

The price strip is filled **from the last reading downwards**, not from the top.
That is where the fill actually reaches the gutter; filling the whole strip
paints colour above the line, which the fill itself never does.

The bottom strip runs the full width of the chart rather than stopping at the
price axis. The square where the two meet is the only right angle on a chart,
so an unpainted notch there is more noticeable than either strip.

The axis borders are not drawn where the tint crosses them. A border marks the
boundary between plot and gutter, and the tint is there to say that boundary is
not a boundary — a pale line down the middle of a continuous colour is the seam
put back, a pixel wide.

**One series tints, and it is the first that asks.** Two washes over one strip
is mud; picking by drawing order at least gives an answer you can predict and
change.

Off by default, because it is a strong look and a chart carrying a volume
histogram or three lines beside the area is not improved by it.

## BaselineSeries

| option | default | |
|---|---|---|
| `baseValue` | `{ type: 'price', price: 0 }` | where the two halves split |
| `topLineColor` | `'rgba(34, 171, 148, 1)'` | |
| `topFillColor1` | `'rgba(34, 171, 148, 0.28)'` | at the line |
| `topFillColor2` | `'rgba(34, 171, 148, 0.05)'` | at the far edge |
| `bottomLineColor` | `'rgba(242, 54, 69, 1)'` | |
| `bottomFillColor1` | `'rgba(242, 54, 69, 0.05)'` | |
| `bottomFillColor2` | `'rgba(242, 54, 69, 0.28)'` | |
| `lineWidth` | `3` | |
| `lineStyle` | `LineStyle.Solid` | |
| `lineType` | `LineType.Simple` | |
| `pointMarkersVisible` / `pointMarkersRadius` | | **full build** |

`baseValue` is the whole point: set it to your entry price, to zero for a
spread, or to the first reading for a performance chart.

## CandlestickSeries

| option | default | |
|---|---|---|
| `upColor` | `'#22ab94'` | |
| `downColor` | `'#f23645'` | |
| `borderVisible` | `true` | |
| `borderUpColor` | `'#22ab94'` | |
| `borderDownColor` | `'#f23645'` | |
| `wickVisible` | `true` | |
| `wickUpColor` | `'#22ab94'` | |
| `wickDownColor` | `'#f23645'` | |
| `bodyRadius` | `2` | corner radius in CSS pixels; `0` draws square bodies |

A reading can carry `color`, `borderColor` and `wickColor` of its own, which
overrides all of the above for that one candle — how a single bar is marked
out without a second series.

### Rounded bodies

Candle bodies carry a two-pixel radius by default. Whether a body is rounded at
all is decided by its **width**, never its height: every candle on a chart
shares a width and none of them shares a height, so testing height too rounds a
tall body and leaves its neighbour square at the same zoom — which does not read
as a rule, it reads as a fault. Short bodies are protected by tapering the
radius to a third of their height instead, so a two-pixel body gets two thirds
of a pixel and stays a line rather than becoming a lozenge.

Below about seven device pixels wide the radius is dropped entirely. A daily
candle is five or six across, and two pixels of radius on that is most of the
shape.

`bodyRadius: 0` turns it off:

<ChartDemo :height="280">

```js
const bars = data.slice(-40);

chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',

    // Square corners, the way most charting libraries draw them.
    bodyRadius: 0,
}).setData(bars);

chart.timeScale().fitContent();
```

</ChartDemo>

`borderVisible: false` gives the flat, borderless candle some designs prefer.
Below about three pixels a slot the border is skipped anyway, because a border
either side of a one-pixel body is not a candle.

Borderless and wickless, which is a different chart entirely — it says "where
it opened and closed" and refuses to say where it went:

<ChartDemo :height="280">

```js
chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderVisible: false,
    wickVisible: false,
}).setData(data.slice(-60));

chart.timeScale().fitContent();
```

</ChartDemo>

## BarSeries

| option | default | |
|---|---|---|
| `upColor` | `'#22ab94'` | |
| `downColor` | `'#f23645'` | |
| `openVisible` | `true` | the left tick |
| `thinBars` | `true` | one-pixel bars regardless of zoom |

`thinBars: false` scales the stroke with the bar spacing, which reads better on
a zoomed-in chart and turns to mud on a zoomed-out one. Zoom this one out and
watch it thicken:

<ChartDemo :height="280">

```js
chart.addSeries(BarSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    openVisible: true,
    thinBars: false,     // stroke scales with the zoom
}).setData(data.slice(-45));

chart.timeScale().fitContent();
```

</ChartDemo>

## HistogramSeries

| option | default | |
|---|---|---|
| `color` | `'#22ab94'` | |
| `base` | `0` | the value columns stand on |

Each reading may carry its own `color`, which is how volume is tinted by
whether the bar closed up.

`base` matters for anything signed — set it to `0` for net flow and the columns
grow up and down from the middle rather than all from the floor.

## Custom series

**Full build.** `addCustomSeries` takes your own pane view and any options
object you like; the common options above still apply. See
[custom series](/plugins/custom-series).

## What next

- [Chart options](/api/chart-options) — everything on the chart itself
- [API reference](/api/) — the methods
- [Choosing a series](/start/choosing-a-series) — which one, and why
