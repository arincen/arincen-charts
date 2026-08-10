# Load history on scroll

The reader pans left, runs out of data, and more arrives. Three parts: knowing
when, fetching once, and prepending without losing their place.

## Knowing when

```js
chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (range && range.from < 20) {
        loadOlder();
    }
});
```

`range.from` is a **logical** position — where the left edge sits in the data,
counted in readings. It is deliberately unclamped, so it goes negative once the
viewport runs past the first reading. That is the signal, and it is why the
logical range exists.

Trigger at `< 20` rather than `< 0`: fetching when the reader has already hit
the wall means they watch a blank gap while the request is in flight. Twenty
readings of warning is usually a fetch's worth of scrolling.

## Fetching once

The handler fires on **every** frame of a pan. Without a guard, one flick sends
thirty identical requests.

```js
let loading = false;
let exhausted = false;

async function loadOlder() {
    if (loading || exhausted) {
        return;
    }

    loading = true;

    try {
        const older = await fetch(`/api/candles?before=${history[0].time}`).then((r) => r.json());

        if (older.length === 0) {
            exhausted = true;

            return;
        }

        prepend(older);
    } finally {
        loading = false;
    }
}
```

`exhausted` matters as much as `loading`. Without it, a reader parked at the
start of a finite dataset sends a request per frame, forever, and every one
comes back empty.

## Prepending without moving the view

This is the part that goes wrong. `setData` with a longer array shifts every
logical position — what was reading 0 is now reading 500 — so the reader is
thrown to a different part of the chart mid-gesture.

**Save the range, prepend, then restore it shifted by how many arrived:**

```js
function prepend(older) {
    const scale = chart.timeScale();
    const before = scale.getVisibleLogicalRange();

    history = [...older, ...history];
    series.setData(history);

    if (before) {
        scale.setVisibleLogicalRange({
            from: before.from + older.length,
            to: before.to + older.length,
        });
    }
}
```

The reader keeps looking at the same bars. The scrollbar, conceptually, got
longer to the left.

## The whole thing

```js
import { createChart, CandlestickSeries } from '@arincen/charts';

const chart = createChart(container, { autoSize: true });
const series = chart.addSeries(CandlestickSeries, {});

let history = await fetch('/api/candles?limit=500').then((r) => r.json());
let loading = false;
let exhausted = false;

series.setData(history);
chart.timeScale().fitContent();

chart.timeScale().subscribeVisibleLogicalRangeChange(async (range) => {
    if (! range || range.from > 20 || loading || exhausted) {
        return;
    }

    loading = true;

    try {
        const older = await fetch(`/api/candles?before=${history[0].time}&limit=500`)
            .then((r) => r.json());

        if (! older.length) {
            exhausted = true;

            return;
        }

        const before = chart.timeScale().getVisibleLogicalRange();

        history = [...older, ...history];
        series.setData(history);

        if (before) {
            chart.timeScale().setVisibleLogicalRange({
                from: before.from + older.length,
                to: before.to + older.length,
            });
        }
    } finally {
        loading = false;
    }
});
```

## Running

The fetch is a local generator so the page stays self-contained, but every
other line is the real thing. **Pan left** and watch the counter climb.

<ChartDemo :height="360">

```js
const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
});

const day = 24 * 60 * 60;
let seed = 4242;

// Stands in for `fetch('/api/candles?before=…')`.
const older = (before, count) => {
    const rows = [];
    let price = 100;

    for (let index = count; index > 0; index--) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;

        const open = price;
        const close = open + (seed / 0x7fffffff - 0.5) * 2.2;

        rows.push({
            time: before - index * day,
            open,
            high: Math.max(open, close) + 0.6,
            low: Math.min(open, close) - 0.6,
            close,
        });

        price = close;
    }

    return rows;
};

let history = older(1735689600, 200);
let loading = false;
let exhausted = false;
let pages = 1;

series.setData(history);
chart.timeScale().fitContent();

const badge = document.createElement('div');

badge.style.cssText = 'position:absolute;top:10px;left:12px;z-index:3;'
    + 'font:11px/1.6 ui-monospace,monospace;color:#737373;pointer-events:none';
container.appendChild(badge);

const show = () => {
    badge.textContent = `${history.length} bars · ${pages} page(s)`
        + `${exhausted ? ' · no more' : ''}${loading ? ' · loading…' : ''}`;
};

show();

const onRange = (range) => {
    // Fire before the reader hits the wall, not after.
    if (! range || range.from > 20 || loading || exhausted) {
        return;
    }

    loading = true;
    show();

    // A real page awaits a request here.
    setTimeout(() => {
        if (pages >= 5) {
            exhausted = true;
            loading = false;

            // Stop the reader scrolling into nothing, now that there is nothing.
            chart.timeScale().applyOptions({ fixLeftEdge: true });
            show();

            return;
        }

        const batch = older(history[0].time, 200);

        // Save the range, prepend, then shift it by however many arrived —
        // otherwise every logical position moves and the reader is thrown.
        const before = chart.timeScale().getVisibleLogicalRange();

        history = [...batch, ...history];
        series.setData(history);

        if (before) {
            chart.timeScale().setVisibleLogicalRange({
                from: before.from + batch.length,
                to: before.to + batch.length,
            });
        }

        pages++;
        loading = false;
        show();
    }, 350);
};

chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
onCleanup(() => chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange));
```

</ChartDemo>

Notice that the bars under the pointer do not jump when a page lands. That is
the range being restored, shifted by `batch.length` — remove those four lines
and the chart teleports on every load.

## Two things worth adding

**Stop the reader scrolling into nothing** once you know there is no more:

```js
chart.timeScale().applyOptions({ fixLeftEdge: true });
```

Set it when `exhausted` becomes true, not before — set early it fights the very
scroll that would have triggered a fetch.

**Cap what you hold.** A reader who scrolls for a minute can accumulate a
hundred thousand readings. Either drop the newest end as you prepend, or turn on
[conflation](/guide/performance):

```js
chart.applyOptions({ timeScale: { enableConflation: true } });
```

## Do not do this with `update`

`update` appends or replaces at the live edge and rejects anything earlier than
the last reading. History is not an update — it is a new dataset with a longer
left side, and `setData` is the call for that.

## What next

- [Large datasets](/guide/performance) — what to do once you have loaded a lot
- [The time scale](/guide/time-scale) — logical versus time ranges
- [Live data](/start/live-data) — the other end of the same chart
