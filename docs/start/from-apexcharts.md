# Coming from ApexCharts

ApexCharts is a general chart library with candlesticks in it. The nearest
thing to a philosophical difference: it draws SVG and takes one big options
object, and this draws canvas and takes calls.

## Why you would move

- **Canvas rather than SVG.** A few hundred candles is a few hundred DOM nodes
  in SVG, and it is felt on a phone. Ours is one canvas element however many
  bars are on it.
- **Weekends do not appear.** A `datetime` axis draws real elapsed time, so a
  market that was shut on Sunday leaves a gap. Bars here are placed by their
  position in the data.
- **The chart can describe itself.** `toText()`, `annotate()` and `pointer()`
  have no equivalent to port.

## The same chart, both ways

```js
// ApexCharts
const chart = new ApexCharts(element, {
    chart: { type: 'candlestick', height: 350 },
    series: [{
        data: [
            { x: new Date(2026, 0, 1), y: [10, 12, 9, 11] },
            { x: new Date(2026, 0, 2), y: [11, 14, 10, 13] },
        ],
    }],
    xaxis: { type: 'datetime' },
});

chart.render();
```

```js
// Arincen Charts
import { createChart, CandlestickSeries } from '@arincen/charts';

const chart = createChart(element, { autoSize: true });

chart.addSeries(CandlestickSeries, {}).setData([
    { time: '2026-01-01', open: 10, high: 12, low: 9, close: 11 },
    { time: '2026-01-02', open: 11, high: 14, low: 10, close: 13 },
]);
```

<ChartDemo :height="300">

```js
const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
    title: 'ARN',
});

series.setData(data.slice(-70));

series.createPriceLine({ price: data[data.length - 1].close, title: 'last', axisLabelVisible: true });
chart.timeScale().fitContent();
```

</ChartDemo>

## What changes

| ApexCharts | here |
|---|---|
| one options object describing everything | `createChart(element, options)`, then calls on what it returns |
| `series: [{ data: [{ x, y: [o, h, l, c] }] }]` | `setData([{ time, open, high, low, close }])` — named, not positional |
| `chart.render()` | drawing starts when data arrives |
| `chart.updateSeries([...])` | `series.setData(next)`, or `series.update(bar)` for one reading |
| `chart.destroy()` | `chart.remove()` |
| `annotations.yaxis` in the options | `series.createPriceLine({ price, title })`, added and removed at any time |
| `xaxis: { type: 'datetime' }` | there is no other kind — and it is an index, so gaps collapse |

The `y: [o, h, l, c]` array is the one to watch when you port: four positional
numbers become four named fields, and getting them the wrong way round is
silent in one and impossible in the other.

## What we do not have

- Every non-financial chart type: pie, radial, treemap, heatmap, funnel
- The built-in toolbar, with its own zoom and export menu
- Annotations declared up front in options — ours are calls
- SVG output, so no styling anything with CSS and no inspecting bars in devtools

## Moving across

Series data is a `map`, and the axis type disappears:

```js
series.setData(apexSeries[0].data.map((point) => ({
    time: Math.floor(new Date(point.x).getTime() / 1000),
    open: point.y[0],
    high: point.y[1],
    low: point.y[2],
    close: point.y[3],
})));
```

A `Date` in milliseconds is accepted too — `toTimestamp` converts it — so the
division is optional and only there to be explicit.
