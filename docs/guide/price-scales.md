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

The same series on a linear scale and a logarithmic one. On a run this long the
early movement is invisible in the first and readable in the second, because
only the second gives a ten per cent move the same height wherever it happens.

<ChartDemo :height="260">

```js
// A price that compounds: 100 to about 900.
const grown = [];
let price = 100;
let seed = 11;

data.forEach((bar, index) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    price *= 1 + (seed / 0x7fffffff - 0.42) * 0.03;
    grown.push({ time: bar.time, value: price });
});

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 }).setData(grown);
chart.priceScale('right').applyOptions({ mode: PriceScaleMode.Logarithmic });
chart.timeScale().fitContent();
```

</ChartDemo>

Change `Logarithmic` to `Normal` in that snippet and reload to see the
difference — the code above is what runs.

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
entire point of having more than one. A price in the hundreds and a volume in
the millions share one pane here and neither flattens the other:

<ChartDemo :height="300">

```js
const price = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
});

const volume = chart.addSeries(HistogramSeries, {
    priceScaleId: 'volume',
    base: 0,
    priceLineVisible: false,
    lastValueVisible: false,
});

const bars = data.slice(-70);

price.setData(bars);
volume.setData(bars.map((bar, index) => ({
    time: bar.time,
    value: 1_200_000 + Math.abs(bar.close - bar.open) * 900_000 + (index % 7) * 90_000,
    color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.5)' : 'rgba(242, 54, 69, 0.5)',
})));

// The overlay is pushed into the bottom quarter; the price keeps the rest.
chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.76, bottom: 0 } });
chart.timeScale().fitContent();
```

</ChartDemo>

## Every scale option, set

<ChartDemo :height="320">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2, title: 'inverted' });

series.setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

const scale = chart.priceScale('right');

scale.applyOptions({
    visible: true,
    mode: PriceScaleMode.Normal,

    // Yields and spreads read upside down: a falling number is good news.
    invertScale: true,

    // Nudge labels apart rather than letting them collide.
    alignLabels: true,

    // Drop a label rather than clip it at the top or bottom edge.
    entireTextOnly: true,

    borderVisible: true,
    borderColor: '#d4d4d4',
    ticksVisible: true,

    // A fixed width, so two stacked charts line up. See below.
    minimumWidth: 72,

    scaleMargins: { top: 0.15, bottom: 0.15 },
});

chart.timeScale().fitContent();

// Freeze the range, then hand it back to autoscale.
const button = document.createElement('button');

let auto = true;

button.style.cssText = 'position:absolute;top:10px;left:12px;z-index:3;padding:5px 10px;'
    + 'border:1px solid #d4d4d4;border-radius:8px;background:#fff;font:600 11px system-ui;cursor:pointer';

const label = () => {
    button.textContent = `setAutoScale(${! auto})  ·  now ${scale.options().autoScale}`
        + `  ·  width ${scale.width()}px`;
};

button.onclick = () => {
    auto = ! auto;
    scale.setAutoScale(auto);
    label();
};

label();
container.appendChild(button);
```

</ChartDemo>

Prices increase downwards, because `invertScale` is on. Press the button to
freeze the range and pan — with autoscale off the range stays where it was.

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
