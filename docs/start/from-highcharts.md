# Coming from Highcharts Stock

Highcharts Stock is the incumbent, and it is good. It is also commercial
software: free for personal and non-commercial use, and licensed per developer
otherwise. That is usually the reason somebody arrives here, so it is worth
saying plainly rather than hinting at it.

This is MIT. Use it in a product, sell the product, no licence to buy and
nothing to renew.

## Why you would move

- **Licensing.** MIT, and the attribution mark is a request rather than a
  condition — one option turns it off.
- **Size.** `@arincen/charts` is about 26 KB gzipped with no dependencies. A
  stock chart with modules attached is a different order of thing.
- **The chart can describe itself.** `toText()`, `annotate()` and `pointer()`
  have no equivalent to port.

What you give up is real, and it is in *What we do not have* below. Be honest
with yourself about the range selector and the navigator before you start.

## The same chart, both ways

```js
// Highcharts Stock
Highcharts.stockChart('container', {
    rangeSelector: { selected: 1 },
    series: [{
        type: 'candlestick',
        name: 'ARN',
        // [timestamp, open, high, low, close]
        data: [[1767225600000, 10, 12, 9, 11], [1767312000000, 11, 14, 10, 13]],
    }],
});
```

```js
// Arincen Charts
import { createChart, CandlestickSeries } from '@arincen/charts';

const chart = createChart(document.getElementById('container'), { autoSize: true });

chart.addSeries(CandlestickSeries, { title: 'ARN' }).setData([
    { time: '2026-01-01', open: 10, high: 12, low: 9, close: 11 },
    { time: '2026-01-02', open: 11, high: 14, low: 10, close: 13 },
]);

chart.timeScale().fitContent();
```

<ChartDemo :height="300">

```js
const price = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
    title: 'ARN',
});

price.setData(data.slice(-90));
chart.timeScale().fitContent();

// The period buttons a range selector would give you, in the API you already
// have: a visible range is two times.
const bars = data.slice(-90);

ui.options(['1M', '3M', 'All'], (index) => {
    const spans = [22, 66, bars.length];
    const from = bars[Math.max(0, bars.length - spans[index])].time;

    chart.timeScale().setVisibleRange({ from, to: bars[bars.length - 1].time });
});
```

</ChartDemo>

## What changes

| Highcharts Stock | here |
|---|---|
| `Highcharts.stockChart('id', config)` | `createChart(element, options)` — an element, not an id |
| `data: [[time, o, h, l, c]]` positional | `{ time, open, high, low, close }` named |
| modules attached to a global (`stock`, `indicators`, `exporting`) | two builds, and what you do not import is not in the file |
| `chart.update(config)` | `chart.applyOptions(next)`, `series.applyOptions(next)` |
| `chart.destroy()` | `chart.remove()` |
| `yAxis.plotLines` | `series.createPriceLine({ price, title })` |
| `rangeSelector` | `timeScale().setVisibleRange({ from, to })` behind your own buttons |
| `navigator`, `scrollbar` | pan and zoom on the chart itself |

## What we do not have

Said plainly, because these are the ones people miss:

- **The range selector and navigator.** The demo above is what replacing them
  looks like: a few buttons and one call. It is not nothing, but it is not free.
- **Built-in technical indicators.** Highcharts ships dozens. We ship none —
  compute the series yourself and add it as another line.
- **Exporting to PDF/SVG and printing.** `toImage()` gives you a PNG.
- **Accessibility module, drilldown, stock tools, drawing toolbar.**
- **Every non-financial chart type.**

## Moving across

The data is a `map`, and milliseconds are handled:

```js
series.setData(highchartsData.map(([time, open, high, low, close]) => ({
    time, open, high, low, close,
})));
```

Positional to named is the whole conversion. Times in milliseconds are
converted on the way in, so the timestamps you already have work unchanged.
