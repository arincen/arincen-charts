# A live streaming chart

The whole thing assembled: history, a socket, a candle that forms in place, a
volume pane, and a "go to now" button that appears only when the reader has
scrolled away from the live edge.

<ChartDemo :height="360">

```js
const price = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
});

const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', base: 0 });

chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

const history = data.slice(0, 90);

price.setData(history);
volume.setData(history.map((bar, index) => ({
    time: bar.time,
    value: 400 + Math.abs(bar.close - bar.open) * 900 + (index % 7) * 60,
    color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.6)' : 'rgba(242, 54, 69, 0.6)',
})));

chart.timeScale().fitContent();

// A "go to now" button, shown only when the live edge is off screen.
const button = document.createElement('button');

button.textContent = 'Go to now ›';
button.style.cssText = 'position:absolute;right:70px;bottom:34px;z-index:3;display:none;'
    + 'padding:5px 10px;border:0;border-radius:8px;background:#0a0a0a;color:#fff;'
    + 'font:600 12px system-ui;cursor:pointer';
button.onclick = () => chart.timeScale().scrollToRealTime();
container.appendChild(button);

chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    const live = price.data().length - 1;

    button.style.display = range && range.to < live ? 'block' : 'none';
});

// The feed. Eight ticks revise the forming bar, then a new period opens.
const period = 24 * 60 * 60;
let bar = { ...history[history.length - 1] };
let ticks = 0;

const feed = setInterval(() => {
    const last = bar.close + (Math.random() - 0.5) * 1.3;

    if (ticks >= 8) {
        bar = { time: bar.time + period, open: bar.close, high: last, low: last, close: last };
        ticks = 0;
    } else {
        bar = { ...bar, high: Math.max(bar.high, last), low: Math.min(bar.low, last), close: last };
        ticks++;
    }

    price.update(bar);
    volume.update({
        time: bar.time,
        value: 400 + Math.abs(bar.close - bar.open) * 900,
        color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.6)' : 'rgba(242, 54, 69, 0.6)',
    });
}, 450);

onCleanup(() => clearInterval(feed));
```

</ChartDemo>

Scroll back a few bars — the button appears. Scroll to the right edge and it
goes away.

## The four decisions in that code

**One `setData`, then only `update`.** History arrives as an array and costs one
pass. Every tick after it touches one reading. A hundred `update`s inside one
frame still cost one redraw, because drawing is scheduled rather than immediate.

**The whole bar, every tick.** `update` replaces a reading; it does not patch
one. Sending `{ time, close }` to a candlestick series sets open, high and low
to `undefined` and you get a hole where a candle was.

**Never `fitContent()` on a tick.** It refits the range on every reading, so the
chart zooms out forever and the reader cannot hold a zoom level. Once, after
`setData`, and then never again.

**The chart does not follow on its own — and that is right.** With the default
`shiftVisibleRangeOnNewBar: true` the view moves only when the newest bar was
already on screen. A reader who has scrolled back to March stays in March while
ticks keep arriving. The "go to now" button is how they come back, deliberately.

## The socket, for real

```js
const socket = new WebSocket('wss://example.com/stream');

socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    price.update({
        time: message.t / 1000,     // seconds, not milliseconds
        open: message.o,
        high: message.h,
        low: message.l,
        close: message.c,
    });
});

socket.addEventListener('close', () => {
    // Reconnect, then re-fetch history: what arrived while you were away is a
    // gap, and gaps are `setData`, not `update`.
    setTimeout(connect, 1000);
});
```

### Reconnecting

The part people leave until it breaks in production. On reconnect you have a
hole — whatever the feed sent while the socket was down. `update` cannot fill a
hole, because it rejects anything earlier than the last reading it took.

So: **fetch history again, `setData`, then resume `update`.** It is one extra
request on an event that should be rare, and it is the difference between a
chart that recovers and one that quietly shows the wrong shape until someone
reloads.

## Throttling a fast feed

If the feed sends several hundred messages a second, keep the newest and apply
it on a timer:

```js
let pending = null;

socket.addEventListener('message', (event) => {
    pending = JSON.parse(event.data);
});

const timer = setInterval(() => {
    if (pending) {
        price.update(pending);
        pending = null;
    }
}, 100);
```

Ten frames a second reads as continuous, and the messages you skipped were each
overwritten by the next one anyway.

Do this only if you have measured a problem. The chart coalesces redraws into
one per frame on its own, so the usual reason to throttle is the work *around*
the update — your own indicator maths, or a React render per tick.

## Cleaning up

```js
socket.close();
clearInterval(timer);
chart.remove();
```

All three. `chart.remove()` drops the canvases, listeners and observers, and it
knows nothing about your socket.

## What next

- [Live data](/start/live-data) — `update` in detail, and the time rules
- [Panes](/guide/panes) — volume in its own strip rather than a second scale
- [Synchronised charts](/recipes/synced-charts) — when it has to be two charts
