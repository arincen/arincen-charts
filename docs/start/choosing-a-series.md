# Choosing a series

Seven of them. Most of the time the right one is obvious in hindsight and not
at the moment you are typing, so here is the decision rather than the list.

Every chart on this page is live and every code block beneath one is what drew
it. `chart` and `data` are already in scope, as
[explained here](/start/first-chart#your-first-chart).

## The short version

| you want to show | use |
|---|---|
| a value over time | [Line](#line) |
| a value, and that it is large | [Area](#area) |
| a value against a threshold | [Baseline](#baseline) |
| what a market did within each period | [Candlestick](#candlestick) |
| the same, for a reader who prefers bars | [Bar](#bar) |
| a quantity per period | [Histogram](#histogram) |
| something none of these draw | [Custom](#custom) |

## Line

The default answer. One value per moment, joined up.

<ChartDemo :height="260">

```js
chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 })
    .setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();
```

</ChartDemo>

Reach for it when the reader cares about the shape of the movement and not the
magnitude of the number. Two lines on one chart compare well; five do not.

**A line can be three shapes**, and the choice is not decoration. Here is the
same policy rate drawn all three ways — a rate that moved four times in six
months and sat still in between.

<ChartDemo :height="300">

```js
const decisions = { 12: 0.25, 26: 0.25, 41: 0.25, 52: -0.5 };
const rate = [];
let level = 4.5;

data.slice(0, 70).forEach((bar, index) => {
    level += decisions[index] ?? 0;
    rate.push({ time: bar.time, value: level });
});

// The same readings, three ways of joining them up.
chart.addSeries(LineSeries, { lineType: LineType.WithSteps, color: '#22ab94', lineWidth: 2 })
    .setData(rate);

chart.addSeries(LineSeries, { lineType: LineType.Simple, color: '#db2777', lineWidth: 1 })
    .setData(rate.map((point) => ({ time: point.time, value: point.value + 0.35 })));

chart.addSeries(LineSeries, { lineType: LineType.Curved, color: '#0891b2', lineWidth: 1 })
    .setData(rate.map((point) => ({ time: point.time, value: point.value + 0.7 })));

chart.timeScale().fitContent();
```

</ChartDemo>

The three are offset so you can see them at once; they are the same numbers.
Green holds and jumps, pink cuts the corner, blue rounds it.

Use `WithSteps` for anything that changes at moments rather than continuously —
a policy rate, a dividend, a position size. Drawing those as diagonals claims
the value glided between the readings, which is not what happened.

Use `Curved` when the shape matters more than the readings. It passes through
every point, so it does not invent prices; but on flat-then-jump data it can
bulge slightly past a reading before settling, which is exactly the data
`WithSteps` is for.

## Area

A line with the space beneath it filled. Everything true of a line is true
here.

<ChartDemo :height="260">

```js
chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(219, 39, 119, 0.32)',
    bottomColor: 'rgba(219, 39, 119, 0.02)',
    lineWidth: 2,
}).setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();
```

</ChartDemo>

The fill says "this is a quantity, and it accumulates" — a balance, a portfolio
value, a volume of interest. It reads as heavier than a line, which is useful
once and tiring five times: **do not put two area series on one chart**, because
the fills stack into mud.

## Baseline

Two colours, split at a value you choose. Above the line is one story, below it
is another.

<ChartDemo :height="260">

```js
const values = data.map((bar) => ({ time: bar.time, value: bar.value }));
const middle = values.reduce((total, point) => total + point.value, 0) / values.length;

chart.addSeries(BaselineSeries, {
    baseValue: { type: 'price', price: middle },
    topLineColor: '#22ab94',
    topFillColor1: 'rgba(34, 171, 148, 0.28)',
    topFillColor2: 'rgba(34, 171, 148, 0.02)',
    bottomLineColor: '#f23645',
    bottomFillColor1: 'rgba(242, 54, 69, 0.02)',
    bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
}).setData(values);

chart.timeScale().fitContent();
```

</ChartDemo>

The right choice whenever a threshold is the point: profit and loss around
break-even, a spread around zero, performance against an index. The reader sees
which side of the line they are on before reading a single number.

## Candlestick

Four prices per period — open, high, low, close — as a body with wicks.

<ChartDemo :height="280">

```js
chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
}).setData(data.slice(-60));

chart.timeScale().fitContent();
```

</ChartDemo>

```js
{ time: '2024-01-01', open: 100, high: 106, low: 99, close: 104 }
```

Use it when *within* the period matters — where price went, not only where it
ended. That is most trading charts, which is why it is the shape people picture
when they hear "financial chart".

A single reading can be coloured on its own, which is how one bar is marked out
without a second series drawn on top. The pink candle below carries its own
three colours and nothing else on the chart knows about it.

<ChartDemo :height="280">

```js
const bars = data.slice(-60).map((bar, index) => (index === 42 ? {
    ...bar,
    color: '#f0abfc',
    borderColor: '#f0abfc',
    wickColor: '#f0abfc',
} : bar));

chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
}).setData(bars);

chart.timeScale().fitContent();
```

</ChartDemo>

## Bar

The same four prices, drawn as a vertical line with a tick left for the open
and right for the close.

<ChartDemo :height="280">

```js
chart.addSeries(BarSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    openVisible: true,
}).setData(data.slice(-60));

chart.timeScale().fitContent();
```

</ChartDemo>

The same information as a candlestick, in less ink. Some readers — and some
markets — simply prefer it. Choose it for that reason, not because it is
different.

## Histogram

A column per period, standing on a base.

<ChartDemo :height="240">

```js
// Volume, tinted by whether the bar closed up.
const volume = data.slice(-60).map((bar, index) => ({
    time: bar.time,
    value: 400 + Math.abs(bar.close - bar.open) * 900 + (index % 7) * 60,
    color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.6)' : 'rgba(242, 54, 69, 0.6)',
}));

chart.addSeries(HistogramSeries, { base: 0 }).setData(volume);
chart.timeScale().fitContent();
```

</ChartDemo>

```js
{ time: '2024-01-01', value: 1_240_000, color: '#22ab94' }
```

Volume, most often, usually in [its own pane](/guide/panes) under the price.
Any per-period quantity fits: trades, messages, open interest. Each reading may
carry its own colour, which is how volume is tinted by whether the bar closed
up.

## Custom

When none of the seven draw what you need — a heatmap, a footprint chart,
box plots, something nobody has made yet — you draw it yourself against the
same contract the built-in series use.

```js
import { createChart } from '@arincen/charts/full';

const series = chart.addCustomSeries(myPaneView, {});
```

Full build only. See [custom series](/plugins/custom-series).

## Two more decisions people ask about

### One chart or two?

Series on the same chart share a price scale, which is right when they share
units and wrong when they do not. A price and its moving average belong
together. A price and its volume do not — put volume in its own
[pane](/guide/panes), or on a [second price scale](/guide/price-scales).

### How much data?

The chart does not slow down as the dataset grows, provided you turn on
[conflation](/guide/performance) for large ones: readings that would land in the
same pixel column are merged before anything is drawn, so half a million
candles draws about nineteen hundred of them.

Off by default, because most charts hold hundreds of readings and would pay for
it without gaining anything.

## What next

- [Series options in full](/guide/series)
- [Live data](/start/live-data)
- [Markers and price lines](/guide/markers) — annotating what a series shows
