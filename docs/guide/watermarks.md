# Watermarks and up/down markers

::: tip Full build only
All three helpers on this page are in `@arincen/charts/full`. They are
attachments rather than core features, which is why the light build does not
carry them.
:::

## A text watermark

The instrument's name behind the data, the way most trading terminals mark a
chart.

**Each of these returns a primitive, and you attach it yourself.** There is no
registration step and no special case in the chart — a watermark is drawn by
exactly the mechanism [any plugin](/plugins/) uses, which is why it can go on
one pane and not another.

```js
import { createChart, createTextWatermark } from '@arincen/charts/full';

const mark = createTextWatermark({
    horzAlign: 'center',
    vertAlign: 'center',
    lines: [
        { text: 'ARINCEN', color: 'rgba(219, 39, 119, 0.16)', fontSize: 44, fontStyle: 'bold' },
        { text: 'Daily', color: 'rgba(219, 39, 119, 0.12)', fontSize: 18 },
    ],
});

chart.panes()[0].attachPrimitive(mark);
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

series.setData(data.slice(-70));
chart.timeScale().fitContent();

const mark = createTextWatermark({
    visible: true,
    horzAlign: 'center',
    vertAlign: 'center',
    lines: [
        { text: 'ARN/USD', color: 'rgba(192, 38, 211, 0.18)', fontSize: 46, fontStyle: 'bold' },
        { text: 'Daily · demo data', color: 'rgba(219, 39, 119, 0.16)', fontSize: 16 },
    ],
});

const pane = chart.panes()[0];

pane.attachPrimitive(mark);
onCleanup(() => pane.detachPrimitive(mark));
```

</ChartDemo>

| option | |
|---|---|
| `visible` | `true` by default; toggle without detaching |
| `horzAlign` | `'left'`, `'center'`, `'right'` |
| `vertAlign` | `'top'`, `'center'`, `'bottom'` |
| `lines[]` | `{ text, color, fontSize, fontFamily, fontStyle, lineHeight }` |

It draws **behind** the series, on the pane you attach it to. In a multi-pane
chart that means it can sit behind the price and leave the volume alone.

```js
mark.applyOptions({ lines: [{ text: 'BTC/USD', fontSize: 46 }] });
pane.detachPrimitive(mark);
```

::: warning It is not the attribution mark
`layout.attributionLogo` is a separate thing — a real anchor element in the
corner. A watermark is painted on the canvas and cannot be a link.
[More](/attribution).
:::

## An image watermark

A logo, from anything the canvas can draw: a `URL`, an `<img>`, a data URI.

```js
const logo = createImageWatermark(logoUrl, {
    alpha: 0.12,
    maxWidth: 240,
    maxHeight: 120,
    padding: 24,
});

chart.panes()[0].attachPrimitive(logo);
```

| option | |
|---|---|
| `alpha` | `0..1` |
| `maxWidth` / `maxHeight` | the image is scaled to fit inside these, keeping its ratio |
| `padding` | space kept from the pane's edges |
| `horzAlign` / `vertAlign` | as above |

The image is loaded once and drawn from cache, so it costs nothing per frame.
It draws nothing until it loads — there is no flash of a half-drawn logo.

<ChartDemo :height="300">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.24)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

series.setData(data.map((bar) => ({ time: bar.time, value: bar.value })));
chart.timeScale().fitContent();

// Any URL the canvas can draw. A data URI keeps this example self-contained.
const logo = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80">'
    + '<text x="0" y="60" font-family="system-ui" font-size="56" font-weight="700"'
    + ' fill="%23db2777">arincen</text></svg>'
);

const mark = createImageWatermark(logo, {
    alpha: 0.16,
    maxWidth: 200,
    maxHeight: 80,
    padding: 20,
    horzAlign: 'right',
    vertAlign: 'bottom',
});

const pane = chart.panes()[0];

pane.attachPrimitive(mark);
onCleanup(() => pane.detachPrimitive(mark));
```

</ChartDemo>

**Use a light alpha.** A watermark at 0.4 is a chart with a logo on top of it;
at 0.12 it is a chart that happens to be branded.

## Up/down markers

A dot on every reading that moved, coloured by direction, fading as it ages.
Made for a live chart where the reader wants to see *what just changed* rather
than read the values.

```js
import { createUpDownMarkers } from '@arincen/charts/full';

const markers = createUpDownMarkers({
    positiveColor: '#22ab94',
    negativeColor: '#f23645',
    updateVisibilityDuration: 5000,
});

series.attachPrimitive(markers);
```

<ChartDemo :height="320">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 });
const values = data.slice(0, 90).map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);
chart.timeScale().fitContent();

const markers = createUpDownMarkers({
    positiveColor: '#22ab94',
    negativeColor: '#f23645',
    updateVisibilityDuration: 4000,
});

series.attachPrimitive(markers);

// Every arriving reading gets a dot, green or red, which fades out after four
// seconds. Watch the right edge.
let last = values[values.length - 1];

const feed = setInterval(() => {
    last = { time: last.time + 86400, value: last.value + (Math.random() - 0.5) * 2.5 };
    markers.update(last);
}, 900);

onCleanup(() => {
    clearInterval(feed);
    series.detachPrimitive(markers);
});
```

</ChartDemo>

**Call `markers.update(point)` rather than `series.update(point)`.** The handle
forwards the reading to the series *and* records which direction it moved; go
around it and the series updates with no marker.

| option | default | |
|---|---|---|
| `positiveColor` | `'#22ab94'` | |
| `negativeColor` | `'#f23645'` | |
| `updateVisibilityDuration` | `5000` | milliseconds before a dot fades |

```js
markers.setData(points);      // replaces the series data and clears the dots
markers.markers();            // the dots showing now
markers.clearMarkers();       // keeps the data, drops the dots
markers.applyOptions({ updateVisibilityDuration: 0 });
markers.options();
series.detachPrimitive(markers);
```

Set `updateVisibilityDuration: 0` to keep every dot forever. That is right for
a replay of a session and wrong for a live feed, where it becomes a solid line
of dots within a minute.

## What next

- [Live data](/start/live-data) — the update path these markers sit on
- [Markers and price lines](/guide/markers) — the annotations you place yourself
- [The two builds](/guide/two-builds) — why these three are full-build only
