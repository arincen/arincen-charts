# Crosshair and interaction

The crosshair is drawn on a second canvas laid over the first. Moving the
pointer redraws only that one, so the data underneath is never touched — which
is why a chart holding half a million bars still tracks the pointer at the
refresh rate of the display.

Each line is drawn twice: a wide, faint wash of its own colour, then the
hairline on top. One hairline cannot be both dark enough to survive a white
candle and light enough to leave a dark one intact, and the usual answer —
pick the darker — loses the line over a filled body, which is exactly where
the price being read came from. The wash separates the line from whatever is
under it without reading as a second line.

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

chart.applyOptions({
    crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: '#db2777', style: LineStyle.Dashed, labelBackgroundColor: '#db2777' },
        horzLine: { color: '#db2777', style: LineStyle.Dashed, labelBackgroundColor: '#db2777' },
    },
});

chart.timeScale().fitContent();
```

</ChartDemo>

Hover it. The horizontal line snaps to the close of the bar under the pointer
rather than following the pointer exactly — that is `Magnet`, and it is the
default.

## The four modes

```js
import { CrosshairMode } from '@arincen/charts';

chart.applyOptions({ crosshair: { mode: CrosshairMode.Magnet } });
```

| mode | behaviour |
|---|---|
| `Normal` | the crosshair follows the pointer exactly |
| `Magnet` | the horizontal line snaps to the nearest series value — **default** |
| `MagnetOHLC` | snaps to the nearest of open, high, low or close |
| `Hidden` | no crosshair at all |

`Magnet` is right for reading a price off a chart, because a horizontal line
one pixel above the close is a horizontal line lying to you about the close.
`Normal` is right when the reader is measuring rather than reading — comparing
two levels, or drawing.

`MagnetOHLC` is worth reaching for on candlesticks specifically: it lets the
reader land on a wick's extreme, which is usually the number they wanted.

## Options

```js
chart.applyOptions({
    crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
            visible: true,
            color: '#737373',
            width: 1,
            style: LineStyle.Dotted,
            labelVisible: true,
            labelBackgroundColor: '#0a0a0a',
        },
        horzLine: { /* the same shape */ },
    },
});
```

The two lines are configured independently, which is how you get a horizontal
readout with no vertical rule, or the reverse:

```js
chart.applyOptions({ crosshair: { vertLine: { visible: false } } });
```

## Reacting to it

```js
chart.subscribeCrosshairMove((param) => {
    if (! param.time) {
        return;    // the pointer left the plot
    }

    const point = param.seriesData.get(series);

    legend.textContent = point ? `${point.close}` : '';
});
```

The handler receives:

| field | |
|---|---|
| `time` | the time under the pointer, or `undefined` when outside |
| `logical` | the position under the pointer, fractional |
| `point` | `{ x, y }` in pixels |
| `seriesData` | a `Map` from series to the reading under the pointer |
| `hoveredSeries` | the series nearest the pointer, if any |
| `paneIndex` | which pane, in a multi-pane chart |

**Always check `param.time` first.** The handler fires when the pointer leaves
the plot too, and that call is how you clear a legend rather than leaving the
last value on screen forever.

### A legend that follows the pointer

<ChartDemo :height="320">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.28)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

series.setData(data.map((bar) => ({ time: bar.time, value: bar.value })));
chart.timeScale().fitContent();

// A plain element over the chart. There is no legend widget to configure,
// because a legend is your markup and only the numbers come from here.
const legend = document.createElement('div');

legend.style.cssText = 'position:absolute;top:10px;left:14px;font:600 13px system-ui;'
    + 'color:#db2777;pointer-events:none;z-index:3';
legend.textContent = '—';
container.appendChild(legend);

chart.subscribeCrosshairMove((param) => {
    const point = param.time ? param.seriesData.get(series) : null;

    legend.textContent = point ? point.value.toFixed(2) : '—';
});
```

</ChartDemo>

## Bringing one series forward

Four lines on one chart is a comparison, and while the reader is following one
of them the other three are noise. Hover near any line below — it keeps its
colour and the rest fade back.

<ChartDemo :height="320">

```js
const values = data.map((bar) => ({ time: bar.time, value: bar.value }));
const shades = ['#db2777', '#0891b2', '#ea580c', '#22ab94'];

shades.forEach((colour, index) => {
    chart.addSeries(LineSeries, {
        color: colour,
        lineWidth: 2,
        priceLineVisible: index === 0,
        lastValueVisible: index === 0,
    }).setData(values.map((point) => ({ time: point.time, value: point.value - index * 7 })));
});

// On by default; here explicitly, beside the reach it uses.
chart.applyOptions({ crosshair: { dimOtherSeries: true } });
chart.timeScale().fitContent();
```

</ChartDemo>

Nothing is hidden — the faded lines are still readable, still hit-testable, and
still in the crosshair's data. Set `dimOtherSeries: false` to turn it off.

## A tooltip, without writing one

::: tip Full build only
`createTooltip` is in `@arincen/charts/full`.
:::

```js
import { createChart, createTooltip } from '@arincen/charts/full';

const tip = createTooltip(chart);
```

That is the whole integration. It subscribes to the crosshair, reads the values
under the pointer, positions itself, flips near the edges, and disappears when
the pointer leaves.

<ChartDemo :height="340">

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

price.setData(data.slice(-70));
chart.timeScale().fitContent();

const tip = createTooltip(chart);

onCleanup(() => tip.remove());
```

</ChartDemo>

Hover it, then move toward the right-hand edge — it flips to the other side of
the pointer rather than being clamped against the edge, which would leave it
sitting on top of the bars it is describing.

### Options

| option | default | |
|---|---|---|
| `visible` | `true` | hide without removing |
| `position` | `'pointer'` | or `'top-left'`, `'top-right'` |
| `showTime` | `true` | the time above the values |
| `series` | `null` | which series to report; `null` means all with a reading |
| `formatter` | `null` | write the contents yourself |
| `style` | `{}` | merged into the element's inline style |
| `className` | `''` | for styling from your own stylesheet |

`position: 'top-left'` pins it to a corner, which is what a busy chart usually
wants — a tooltip that moves is a tooltip the reader's eye has to chase.

### Writing the contents

```js
createTooltip(chart, {
    formatter: ({ time, readings }) => readings
        .map(({ series, point }) => `${series.options().title}: ${point.value.toFixed(2)}`)
        .join(' · '),
});
```

Return a string and it is set as **text**, never as markup — a formatter is
handed values from a data feed, and a feed that can put markup on your page is
a feed that can put a script on it. Return an element if you want structure,
and `null` to show nothing for that reading.

<ChartDemo :height="340">

```js
const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.26)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

series.setData(values);
chart.timeScale().fitContent();

const tip = createTooltip(chart, {
    position: 'top-left',
    showTime: false,
    formatter: ({ logical, readings }) => {
        const { point } = readings[0];
        const previous = values[Math.max(0, Math.round(logical) - 1)];
        const change = point.value - previous.value;
        const sign = change >= 0 ? '▲' : '▼';

        return `${point.value.toFixed(2)}   ${sign} ${Math.abs(change).toFixed(2)}`;
    },
});

onCleanup(() => tip.remove());
```

</ChartDemo>

### Handle

```js
tip.applyOptions({ position: 'top-right' });
tip.options();
tip.element();     // the div, for styling or measuring
tip.remove();      // unsubscribes and takes the element with it
```

`remove()` is not optional in a single-page application: the tooltip holds a
crosshair subscription, and a chart that is thrown away without it keeps the
subscription and the element alive.

## Clicks

Single and double, with the hit identifier from any primitive under the
pointer:

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

series.setData(data.slice(-60));
chart.timeScale().fitContent();

const log = document.createElement('div');

log.style.cssText = 'position:absolute;top:8px;left:12px;z-index:3;'
    + 'font:11px/1.7 ui-monospace,monospace;color:#737373;pointer-events:none';
log.textContent = 'click or double-click the chart';
container.appendChild(log);

const onClick = (param) => {
    log.textContent = param.time
        ? `click  bar ${param.logical.toFixed(0)}  at ${param.point.x.toFixed(0)},${param.point.y.toFixed(0)}`
            + `  over ${param.hoveredObjectId ?? 'nothing'}`
        : 'click outside the plot';
};

const onDouble = (param) => {
    log.textContent = `double-click  ${param.time ? `bar ${param.logical.toFixed(0)}` : 'outside'}`;
};

chart.subscribeClick(onClick);
chart.subscribeDblClick(onDouble);

onCleanup(() => {
    chart.unsubscribeClick(onClick);
    chart.unsubscribeDblClick(onDouble);
});
```

</ChartDemo>


```js
chart.subscribeClick((param) => {
    if (param.time) {
        console.log('clicked', param.time, param.point);
    }
});

chart.subscribeDblClick((param) => { /* the same shape */ });
```

Same payload as the crosshair handler. A click that lands outside the plot
still fires with `time` undefined, so the same guard applies.

Every `subscribe…` has an `unsubscribe…` taking the same function reference,
and `chart.remove()` drops all of them.

## Driving the crosshair yourself

```js
chart.setCrosshairPosition(price, time, series);
chart.clearCrosshairPosition();
```

This is how two charts are made to share a pointer: one chart's crosshair
handler sets the other's position. See
[synchronised charts](/recipes/synced-charts) for the whole pattern, including
the loop you have to break.

Here it is driven from a slider rather than a second chart, which is the same
mechanism with less wiring — and the way to put a crosshair somewhere from a
table row, a keyboard shortcut, or a replay control:

<ChartDemo :height="320">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 });
const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);
chart.timeScale().fitContent();

const slider = document.createElement('input');

slider.type = 'range';
slider.min = 0;
slider.max = values.length - 1;
slider.value = Math.floor(values.length / 2);
slider.style.cssText = 'position:absolute;bottom:36px;left:12px;right:70px;z-index:3';
container.appendChild(slider);

const place = () => {
    const point = values[Number(slider.value)];

    chart.setCrosshairPosition(point.value, point.time, series);
};

slider.oninput = place;
slider.onpointerleave = () => chart.clearCrosshairPosition();
place();

// The subscription is here to show the other half of the pair; a real page
// would drive a legend from it.
const watch = () => {};

chart.subscribeCrosshairMove(watch);
onCleanup(() => chart.unsubscribeCrosshairMove(watch));
```

</ChartDemo>

## Touch

Touch is handled without configuration: drag to pan, pinch to zoom, and a long
press puts the crosshair where your finger is. Kinetic scrolling is on for
touch and off for the mouse, which matches what each input feels like.

```js
chart.applyOptions({
    kineticScroll: { touch: true, mouse: false },
    trackingMode: { exitMode: 'onTouchEnd' },
});
```

Every input option there is, set explicitly:

<ChartDemo :height="300">

```js
chart.applyOptions({
    handleScroll: {
        mouseWheel: true,        // wheel pans horizontally
        pressedMouseMove: true,  // drag the plot
        horzTouchDrag: true,
        vertTouchDrag: false,    // vertical drags left to the page
    },
    handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,   // drag an axis to stretch it
        axisDoubleClickReset: true,   // double-click an axis to reset it
    },
    kineticScroll: { touch: true, mouse: false },
    trackingMode: { exitMode: 'onTouchEnd' },
    crosshair: {
        // A hidden series is not a snap target, so the crosshair never lands
        // on a price nobody can see.
        doNotSnapToHiddenSeriesIndices: true,
        vertLine: { labelVisible: true },
        horzLine: { labelVisible: true },
    },
});

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 })
    .setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

// Present, hidden, and therefore not something the crosshair will snap to.
chart.addSeries(LineSeries, { visible: false, color: '#0891b2' })
    .setData(data.map((bar) => ({ time: bar.time, value: bar.value + 6 })));

chart.timeScale().fitContent();
```

</ChartDemo>

Try dragging the price axis up and down, and double-clicking it.

`trackingMode.exitMode` decides when the crosshair goes away on a touch device:
`onTouchEnd` clears it when the finger lifts, `onNextTap` leaves it until the
reader taps elsewhere. Leave it alone unless a designer asks.

::: tip One thing worth copying
On iOS a long press on a canvas raises the copy/lookup callout, which lands on
top of the chart just as the reader is trying to read it. The container sets
`-webkit-touch-callout: none` and `user-select: none` for that reason. If you
wrap the chart in your own element and re-enable selection on it, you will get
the callout back.
:::

## Keyboard and screen readers

::: tip Full build only, and on by default
A chart nobody can reach without a pointer has its prices locked behind a
mouse. That is not something to opt into, so `handleKeyboard` defaults to
`true` in the full build.
:::

Click the chart below, or tab to it, then use the arrow keys.

<ChartDemo :height="320">

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

// Nothing to switch on — this is the default. Shown here to say it exists.
chart.applyOptions({ handleKeyboard: true });
```

</ChartDemo>

| key | |
|---|---|
| ← → | one reading at a time |
| Page Up / Page Down | ten at a time |
| Home / End | the first and last reading |
| Escape | put the crosshair away |

The first arrow press opens the crosshair in the **middle of what is on
screen**, not at the newest reading. Starting at the newest sounds right and
puts it hard against the right edge, half under the price axis, so the first
press looks as though nothing happened. Home and End are absolute and mean what
they say either way.

Every move announces the reading through a hidden live region — the date, the
series title, and the price or all four prices. Moving focus away clears the
crosshair.

**Keys the chart does not use are left alone.** Swallowing everything takes the
arrow keys from a reader trying to scroll the page past the chart, and Tab from
everyone.

**The chart is `role="img"` with a label, not `role="application"`.**
`application` tells a screen reader to hand every keystroke through and stop
offering its own navigation — a large promise to make on behalf of a chart, and
one that takes away the keys the reader already knows.

Turn it off where a chart is decoration rather than information:

```js
createChart(container, { handleKeyboard: false });
```

A [sparkline](/recipes/sparkline) in a table has nothing to announce and should
not be a tab stop — thirty of them would be thirty stops between the reader and
whatever comes after the table.

## Turning it all off

```js
const chart = createChart(container, {
    handleScroll: false,
    handleScale: false,
    crosshair: { mode: CrosshairMode.Hidden },
});
```

Three options and the chart becomes a picture. That is the right build for a
[sparkline](/recipes/sparkline) or a thumbnail in a table — a chart that
accepts a gesture and then does nothing with it is worse than one that never
invited it.

## What next

- [Markers and price lines](/guide/markers) — annotating what the reader found
- [The time scale](/guide/time-scale) — the pan and zoom options in full
- [Synchronised charts](/recipes/synced-charts) — one pointer, several charts
