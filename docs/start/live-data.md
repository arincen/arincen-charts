# Live data

One method does all of it.

```js
series.update({ time: 1704067200, value: 104.2 });
```

Whether that appends a new reading or replaces the last one is decided by the
time you pass, not by a flag you set. That is the whole rule, and everything
else on this page follows from it.

| the time you pass | what happens |
|---|---|
| later than the last reading | a new bar is appended |
| equal to the last reading | that bar is replaced in place |
| earlier than the last reading | rejected — see [below](#out-of-order-readings) |

## A price that keeps arriving

<ChartDemo :height="300">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.28)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

const history = data.slice(0, 80).map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(history);
chart.timeScale().fitContent();

// A feed. In your own code this is a WebSocket message.
let last = history[history.length - 1];

const feed = setInterval(() => {
    last = {
        time: last.time + 24 * 60 * 60,
        value: last.value + (Math.random() - 0.48) * 2,
    };

    series.update(last);
}, 700);

onCleanup(() => clearInterval(feed));
```

</ChartDemo>

Note what is *not* in that loop: no `setData`, no `fitContent`, no redraw call.
`update` moves one reading and the chart draws the frame itself.

::: tip `onCleanup` is this page, not the library
The docs run their own examples, so a demo that starts a timer has to stop it
when you navigate away. In your code that is `onUnmounted`, `useEffect`'s
return value, or wherever your framework does teardown.
:::

## A candle that is still forming

The common case in a trading chart, and the one people write the most code for
before finding out they did not need any. Send the same `time` and the bar is
replaced; send the next `time` and a new one starts.

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

series.setData(data.slice(0, 40));
chart.timeScale().fitContent();

const minute = 60;
let bar = { ...data[39] };
let ticksIntoBar = 0;

const feed = setInterval(() => {
    const price = bar.close + (Math.random() - 0.5) * 1.2;

    if (ticksIntoBar >= 8) {
        // The period closed. Open a new bar at the price the last one ended.
        bar = { time: bar.time + minute * 60 * 24, open: bar.close, high: price, low: price, close: price };
        ticksIntoBar = 0;
    } else {
        // Same period: the bar we already sent, revised.
        bar = {
            ...bar,
            high: Math.max(bar.high, price),
            low: Math.min(bar.low, price),
            close: price,
        };
        ticksIntoBar++;
    }

    series.update(bar);
}, 400);

onCleanup(() => clearInterval(feed));
```

</ChartDemo>

Watch the rightmost candle grow its wick and change colour, then hand over to a
new one. Every one of those frames is a single `update` call with the full bar,
not a patch — `update` takes a whole reading, and the one it replaces is gone.

**Send the complete bar every time.** There is no partial update:
`series.update({ time, close })` on a candlestick series sets an open, high and
low of `undefined`, and you get a gap where a candle was.

## From a WebSocket

The realistic shape, end to end:

```js
const series = chart.addSeries(CandlestickSeries, {});

// History first, in one call. A hundred `update`s is a hundred redraws.
const history = await fetch('/api/candles?symbol=AAPL').then((r) => r.json());

series.setData(history);
chart.timeScale().fitContent();

const socket = new WebSocket('wss://example.com/stream');

socket.addEventListener('message', (event) => {
    const bar = JSON.parse(event.data);

    series.update({
        time: bar.t / 1000,          // seconds, not milliseconds
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
    });
});

// Both of these, or you leak a socket and a canvas.
socket.close();
chart.remove();
```

::: warning Seconds, not milliseconds
A UNIX timestamp in milliseconds is understood, but mixing the two in one
series is not: the chart sorts by the number you give it, and `1704067200000`
sorts after `1704067200` by a factor of a thousand. Pick one and stay with it.
:::

## Keeping the view where the reader put it

The chart does not scroll itself when a bar arrives. That is deliberate — a
reader who has panned back to March did not ask to be dragged to today because
a tick landed.

```js
chart.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: true });
```

With that on, the range moves by one bar when a bar is appended, so the newest
stays at the right edge — but only if the reader was already at the right edge.
Pan away and the view stays where they left it.

To go back to the live edge on demand — a "go to now" button:

```js
chart.timeScale().scrollToRealTime();
```

**Do not call `fitContent()` on every tick.** It refits the whole range on
every reading, so the chart quietly zooms out forever and the reader cannot
hold a zoom level. Call it once after `setData`, and then not again.

## Out-of-order readings

A reading earlier than the last one is rejected rather than inserted. The
chart cannot tell a late message from a correction, and guessing wrong
silently corrupts the series either way.

If your feed can deliver late messages, buffer them and re-`setData` the
affected span. If it delivers corrections, that is what re-`setData` is for as
well:

```js
if (bar.time < lastSentTime) {
    history = merge(history, bar);
    series.setData(history);
} else {
    series.update(bar);
}
```

## Many series, one feed

Each series is updated on its own. There is no batch call, and there does not
need to be one — the chart coalesces work into a single frame, so three
`update` calls in the same tick cost one redraw, not three.

```js
price.update({ time, open, high, low, close });
volume.update({ time, value: quantity, color: close >= open ? green : red });
```

<ChartDemo :height="320">

```js
const price = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
});

// A second scale on the same pane, so volume sits under the price without
// squashing it. `scaleMargins` is what keeps the two out of each other's way.
const volume = chart.addSeries(HistogramSeries, {
    priceScaleId: 'volume',
    base: 0,
});

chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.75, bottom: 0 },
});

const bars = data.slice(0, 60);

price.setData(bars);
volume.setData(bars.map((bar, index) => ({
    time: bar.time,
    value: 400 + Math.abs(bar.close - bar.open) * 900 + (index % 7) * 60,
    color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.6)' : 'rgba(242, 54, 69, 0.6)',
})));

chart.timeScale().fitContent();

let bar = { ...bars[bars.length - 1] };

const feed = setInterval(() => {
    const close = bar.close + (Math.random() - 0.5) * 1.4;

    bar = { ...bar, high: Math.max(bar.high, close), low: Math.min(bar.low, close), close };

    // Both series, same tick, one frame.
    price.update(bar);
    volume.update({
        time: bar.time,
        value: 400 + Math.abs(bar.close - bar.open) * 900,
        color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.6)' : 'rgba(242, 54, 69, 0.6)',
    });
}, 500);

onCleanup(() => clearInterval(feed));
```

</ChartDemo>

The second price scale is a full-build feature. In the light build, put volume
in [its own pane](/guide/panes) — also full build — or draw it on a chart of
its own.

## How fast can it take them

Faster than a feed will send them. `update` touches one reading and marks the
chart for a redraw on the next animation frame, so the cost of a tick is one
frame regardless of how many ticks arrived during it: a hundred updates in
16 milliseconds is one draw, not a hundred.

What does cost is `setData` on a large array, because it rebuilds the series.
Use `update` for the live edge and `setData` for history and corrections, and
there is nothing to tune.

If your feed is faster than the eye — several hundred messages a second on one
symbol — throttle before the chart, not inside it:

```js
let pending = null;

socket.addEventListener('message', (event) => {
    pending = JSON.parse(event.data);
});

setInterval(() => {
    if (pending) {
        series.update(pending);
        pending = null;
    }
}, 100);
```

Ten frames a second reads as continuous, and the ninety messages you skipped
were each overwritten by the next one anyway.

## What next

- [Large datasets](/guide/performance) — half a million bars, and conflation
- [A live streaming chart](/recipes/streaming) — the whole thing, assembled
- [The time scale](/guide/time-scale) — ranges, scrolling and what a "logical
  range" is
