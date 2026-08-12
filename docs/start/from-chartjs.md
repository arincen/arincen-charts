# Coming from Chart.js

Chart.js draws everything — bars, radar, doughnuts, scatter — and draws them
well. This draws one thing. If your chart is a price over time, that difference
is most of what follows.

## Why you would move

- **Financial types are built in.** Candlesticks, OHLC bars, baselines and
  histograms are series definitions here, not a separate plugin plus a date
  adapter.
- **Weekends do not appear.** Bars are placed by their position in the data, so
  a market that was shut on Sunday leaves no gap. On a time axis it does.
- **A crosshair, price lines and a tooltip are in the box** rather than three
  more plugins.

## The same chart, both ways

```js
// Chart.js
import { Chart } from 'chart.js/auto';

const chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
        labels: ['2026-01-01', '2026-01-02', '2026-01-05'],
        datasets: [{ label: 'ARN', data: [24.10, 24.83, 24.41] }],
    },
    options: { responsive: true },
});
```

```js
// Arincen Charts
import { createChart, LineSeries } from '@arincen/charts';

const chart = createChart(element, { autoSize: true });

chart.addSeries(LineSeries, { title: 'ARN' }).setData([
    { time: '2026-01-01', value: 24.10 },
    { time: '2026-01-02', value: 24.83 },
    { time: '2026-01-05', value: 24.41 },
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
chart.timeScale().fitContent();
```

</ChartDemo>

## What changes

| Chart.js | here |
|---|---|
| `new Chart(ctx, config)` | `createChart(element, options)` — an element, not a 2D context |
| `labels` + `datasets` | one array of `{ time, value }`, or `{ time, open, high, low, close }` |
| `type: 'line'` as a string | `addSeries(LineSeries, …)` with the imported definition |
| `chartjs-chart-financial` + a date adapter | candlestick and bar series, no adapter |
| `chart.update()` after mutating data | `series.setData(next)`, or `series.update(bar)` for one reading |
| `chart.destroy()` | `chart.remove()` |
| plugins for tooltip, crosshair, annotations | `createTooltip`, crosshair options, `createPriceLine`, primitives |

The string-versus-definition change is the one with a reason behind it: passing
the imported `LineSeries` is what lets a page that only draws lines ship without
the candlestick renderer in its bundle.

## What we do not have

Everything Chart.js draws that is not a price over time. There is no bar chart
of categories, no pie, no radar, no scatter, no mixed-type chart. If your page
draws a doughnut next to its price chart, keep Chart.js for the doughnut.

There is also no plugin ecosystem of that size. Ours has primitives and custom
series, which are enough to draw anything over a chart, but you will be writing
it rather than installing it.

## Moving across

There is no import-only path from Chart.js — the data shape genuinely differs.
The mechanical part is one map:

```js
const series = chart.addSeries(LineSeries, {});

series.setData(labels.map((time, index) => ({ time, value: datasets[0].data[index] })));
```

Times can be `'2026-01-01'`, a unix timestamp in seconds, or
`{ year, month, day }`. Milliseconds are converted on the way in.
