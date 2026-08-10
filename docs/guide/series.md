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
    topLineColor: 'rgba(34, 171, 148, 1)',
    bottomLineColor: 'rgba(242, 54, 69, 1)',
});
```

## Candlestick

```js
chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderVisible: true,
    wickVisible: true,
});
```

Takes `open`, `high`, `low`, `close`. Candle width follows bar spacing, and the
border is drawn *inside* the body — which is why candles keep a gap between
them at daily density instead of fusing into a band.

## Bar

```js
chart.addSeries(BarSeries, { upColor: '#22ab94', thinBars: true });
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

Three series, three formats, on one chart. Look at the axis labels rather than
the lines:

<ChartDemo :height="300">

```js
// Quoted in quarters: every label lands on .00, .25, .50 or .75.
chart.addSeries(LineSeries, {
    color: '#db2777',
    lineWidth: 2,
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 },
    title: 'quarters',
}).setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

// Volume, abbreviated on its own overlay scale.
chart.addSeries(HistogramSeries, {
    priceScaleId: 'volume',
    base: 0,
    priceFormat: { type: 'volume' },
    priceLineVisible: false,
}).setData(data.map((bar, index) => ({
    time: bar.time,
    value: 2_400_000 + (index % 11) * 260_000,
})));

chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
chart.timeScale().fitContent();
```

</ChartDemo>

## Everything you can ask a series

The methods, on buttons, with what they return underneath:

<ChartDemo :height="400">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2, title: 'ARN' });
const values = data.slice(0, 80).map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);

// A second series, so the drawing order is something you can change.
const other = chart.addSeries(LineSeries, {
    color: '#0891b2',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
});

other.setData(values.map((point) => ({ time: point.time, value: point.value - 5 })));
chart.timeScale().fitContent();

const bar = document.createElement('div');

bar.style.cssText = 'position:absolute;top:8px;left:10px;right:10px;z-index:3;'
    + 'display:flex;gap:6px;flex-wrap:wrap';
container.appendChild(bar);

const out = document.createElement('div');

out.style.cssText = 'position:absolute;bottom:34px;left:12px;z-index:3;'
    + 'font:11px/1.6 ui-monospace,monospace;color:#737373;pointer-events:none';
container.appendChild(out);

const report = () => {
    const range = chart.timeScale().getVisibleLogicalRange();

    out.innerHTML = [
        `seriesType   ${series.seriesType()}   order ${series.seriesOrder()}`,
        `data         ${series.data().length} readings`,
        `dataByIndex  ${JSON.stringify(series.dataByIndex(10))}`,
        `barsInLogicalRange  ${JSON.stringify(series.barsInLogicalRange(range))}`,
        `priceFormatter(1234.5)  ${series.priceFormatter().format(1234.5)}`,
        `priceLines   ${series.priceLines().length}   markers ${series.markers().length}`,
        `options.title  "${series.options().title}"`,
        `priceToCoordinate(${values[0].value.toFixed(1)})  `
            + `${(series.priceToCoordinate(values[0].value) ?? 0).toFixed(0)}px`
            + `  → back ${(series.coordinateToPrice(60) ?? 0).toFixed(1)}`,
    ].join('<br>');
};

const button = (label, run) => {
    const element = document.createElement('button');

    element.textContent = label;
    element.style.cssText = 'padding:4px 9px;border:1px solid #d4d4d4;border-radius:8px;'
        + 'background:#fff;color:#0a0a0a;font:600 11px system-ui;cursor:pointer';
    element.onclick = () => { run(); report(); };
    bar.appendChild(element);
};

let line = null;

button('createPriceLine', () => {
    line = series.createPriceLine({ price: values[40].value, color: '#c026d3', title: 'level' });
});
button('removePriceLine', () => { if (line) { series.removePriceLine(line); line = null; } });
button('setMarkers', () => series.setMarkers([
    { time: values[20].time, position: 'aboveBar', shape: 'circle', color: '#c026d3', text: 'a' },
    { time: values[60].time, position: 'belowBar', shape: 'square', color: '#ea580c', text: 'b' },
]));
button('pop', () => series.pop());
button('setSeriesOrder', () => series.setSeriesOrder(series.seriesOrder() === 0 ? 1 : 0));
button('applyOptions', () => series.applyOptions({ title: `ARN ${series.data().length}` }));
button('removeSeries(other)', () => chart.removeSeries(other));

// Fires whenever the data behind this series changes, from any cause.
series.subscribeDataChanged(report);
onCleanup(() => series.unsubscribeDataChanged(report));

report();
```

</ChartDemo>

`pop()` removes the last reading and is the counterpart to `update` — useful
when a provisional bar has to be withdrawn rather than corrected.

`setSeriesOrder` changes which series draws on top within a pane. It matters
whenever two series overlap and one has a fill.

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
