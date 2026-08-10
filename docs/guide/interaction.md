# Crosshair and interaction

The crosshair is drawn on a second canvas laid over the first. Moving the
pointer redraws only that one, so the data underneath is never touched — which
is why a chart holding half a million bars still tracks the pointer at the
refresh rate of the display.

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
            color: '#9598a1',
            width: 1,
            style: LineStyle.LargeDashed,
            labelVisible: true,
            labelBackgroundColor: '#131722',
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
