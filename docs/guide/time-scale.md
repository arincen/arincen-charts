# The time scale

The horizontal axis, and the single decision that shapes everything else about
it: **bars are placed by their position in the data, never by elapsed time.**

Two readings a millisecond apart and two readings a decade apart sit exactly
one slot apart. A weekend takes no room because no reading is there to take
any. Nothing has to be configured for that to happen, and nothing can be
configured to make it stop.

That is right for market data and wrong for a sensor log. If you need a gap
proportional to the time that passed, this is not the axis for it — send
[whitespace](/start/first-chart#gaps) for the missing periods and the room is
kept.

## Two ways to say "where"

Everything on this page uses one of two coordinate systems, and mixing them up
is the most common confusion.

| | what it counts | example |
|---|---|---|
| **Time range** | actual timestamps in your data | `{ from: 1704067200, to: 1706745600 }` |
| **Logical range** | positions in the data, fractional | `{ from: 12.5, to: 84.5 }` |

A time range can only name moments that exist. A logical range can name
`-20`, which is twenty slots before your first reading — empty space to the
left of the data.

**The logical range is deliberately unclamped**, and that is not an oversight:
it is how you know the viewport has run past the data and it is time to load
more history. See [load history on scroll](/recipes/infinite-history).

## Moving the view

```js
const scale = chart.timeScale();

scale.fitContent();                                    // everything on screen
scale.scrollToRealTime();                              // newest bar at the right edge
scale.setVisibleLogicalRange({ from: 100, to: 160 });  // by position
scale.setVisibleRange({ from: 1704067200, to: 1706745600 });  // by timestamp
scale.scrollToPosition(-20);                           // twenty slots of empty space
scale.resetTimeScale();                                // back to the default framing
```

`resetTimeScale()` restores the default spacing and offset. It is **not**
`fitContent()` — one returns to how the chart started, the other squeezes every
reading onto the screen. They give different answers on any dataset large
enough to matter.

<ChartDemo :height="300">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.28)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

series.setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

// Sixty readings out of a hundred and eighty, chosen by position.
chart.timeScale().setVisibleLogicalRange({ from: 60, to: 120 });
```

</ChartDemo>

Every one of those, on buttons, with the readouts live underneath:

<ChartDemo :height="380">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.28)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);

const scale = chart.timeScale();

scale.fitContent();

const bar = document.createElement('div');

bar.style.cssText = 'position:absolute;top:8px;left:10px;right:10px;z-index:3;'
    + 'display:flex;gap:6px;flex-wrap:wrap;font:12px system-ui';
container.appendChild(bar);

const readout = document.createElement('div');

readout.style.cssText = 'position:absolute;bottom:34px;left:10px;z-index:3;'
    + 'font:11px/1.6 ui-monospace,monospace;color:#737373;pointer-events:none';
container.appendChild(readout);

const button = (label, run) => {
    const element = document.createElement('button');

    element.textContent = label;
    element.style.cssText = 'padding:4px 9px;border:1px solid #d4d4d4;border-radius:8px;'
        + 'background:#fff;color:#0a0a0a;font:600 11px system-ui;cursor:pointer';
    element.onclick = run;
    bar.appendChild(element);
};

button('fitContent', () => scale.fitContent());
button('resetTimeScale', () => scale.resetTimeScale());
button('scrollToRealTime', () => scale.scrollToRealTime());
button('scrollToPosition(-15)', () => scale.scrollToPosition(-15, false));
button('setVisibleLogicalRange', () => scale.setVisibleLogicalRange({ from: 40, to: 90 }));
button('setVisibleRange', () => scale.setVisibleRange({
    from: values[20].time,
    to: values[70].time,
}));

// Everything that reads the scale back, refreshed whenever it moves.
const report = () => {
    const logical = scale.getVisibleLogicalRange();
    const times = scale.getVisibleRange();
    const middle = scale.width() / 2;

    readout.innerHTML = [
        `logical      ${logical ? `${logical.from.toFixed(1)} → ${logical.to.toFixed(1)}` : 'none'}`,
        `time         ${times ? `${times.from} → ${times.to}` : 'none (all whitespace)'}`,
        `scrollPosition ${scale.scrollPosition().toFixed(2)}   size ${scale.width()}×${scale.height()}`,
        `at x=${middle.toFixed(0)}  time ${scale.coordinateToTime(middle) ?? '—'}`
            + `  logical ${scale.coordinateToLogical(middle).toFixed(1)}`,
        `bar 30       index ${scale.timeToIndex(values[30].time)}`
            + `  x ${(scale.logicalToCoordinate(30) ?? 0).toFixed(0)}`
            + `  (timeToCoordinate ${(scale.timeToCoordinate(values[30].time) ?? 0).toFixed(0)})`,
        `barSpacing   ${scale.options().barSpacing.toFixed(2)}`,
    ].join('<br>');
};

report();

scale.subscribeVisibleLogicalRangeChange(report);
scale.subscribeVisibleTimeRangeChange(report);
scale.subscribeSizeChange(report);

onCleanup(() => {
    scale.unsubscribeVisibleLogicalRangeChange(report);
    scale.unsubscribeVisibleTimeRangeChange(report);
    scale.unsubscribeSizeChange(report);
});
```

</ChartDemo>

Press the buttons and watch the readout. `resetTimeScale` and `fitContent`
visibly disagree, which is the point of them being two methods.

## Reading the view

```js
scale.getVisibleRange();          // { from: <time>, to: <time> } or null
scale.getVisibleLogicalRange();   // { from: 12.5, to: 84.5 }
scale.scrollPosition();           // the current right offset, in bars
scale.width();                    // the plot's width in pixels
scale.height();                   // the axis strip's height
```

`getVisibleRange()` returns `null` when the visible span contains no readings —
scrolled entirely into whitespace. `getVisibleLogicalRange()` always answers,
which is why range-watching code should use it.

## Between pixels and data

```js
scale.timeToCoordinate(1704067200);   // x for a timestamp, or null if absent
scale.coordinateToTime(320);          // the time under an x, or null
scale.logicalToCoordinate(42);        // x for a position, including fractions
scale.coordinateToLogical(320);       // position under an x, unclamped
scale.timeToIndex(1704067200);        // where that timestamp sits in the data
```

The `time` pair returns `null` for anything outside the data; the `logical`
pair does not, because a position outside the data is still a position. When
you are drawing something and need an answer for every pixel, use `logical`.

## Watching it move

```js
chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (range && range.from < 10) {
        loadMoreHistory();
    }
});
```

Fires on every pan, zoom, resize, `fitContent`, and on new data — anything that
moves the viewport. There is a matching `subscribeVisibleTimeRangeChange` for
timestamps, and `subscribeSizeChange` for the axis strip's own dimensions.

Every `subscribe…` has an `unsubscribe…` taking the same function reference.
`chart.remove()` drops them all, so a component that removes its chart on
teardown has nothing else to clean up.

## Options

```js
chart.applyOptions({
    timeScale: {
        barSpacing: 8,
        rightOffset: 0,
        shiftVisibleRangeOnNewBar: true,
    },
});
```

| option | default | what it does |
|---|---|---|
| `barSpacing` | `8` | pixels per slot — the zoom level |
| `minBarSpacing` | `0.4` | how far in you can zoom out |
| `maxBarSpacing` | `0` | how far you can zoom in; `0` means the built-in ceiling |
| `rightOffset` | `0` | slots of empty space kept to the right of the last bar |
| `shiftVisibleRangeOnNewBar` | `true` | a new bar moves the view, but only if you were already at the edge |
| `rightBarStaysOnScroll` | `false` | hold the newest bar in place while zooming |
| `fixLeftEdge` / `fixRightEdge` | `false` | refuse to scroll past the data on that side |
| `lockVisibleTimeRangeOnResize` | `false` | a resize changes spacing rather than how much is shown |
| `visible` | `true` | draw the axis at all |
| `borderVisible` / `borderColor` | `true` / `#d6dcde` | the line between plot and axis |
| `ticksVisible` | `false` | small marks under each label |
| `timeVisible` / `secondsVisible` | `false` | show a clock, and its seconds |
| `allowBoldLabels` | `true` | embolden the label that starts a new month or year |
| `tickMarkFormatter` | `null` | write the labels yourself |
| `enableConflation` | `false` | see [large datasets](/guide/performance) |

Most of them at once — a chart pinned to its data, at a fixed zoom, with a
clock on the axis and labels written by hand:

<ChartDemo :height="300">

```js
chart.applyOptions({
    timeScale: {
        // Zoom, and its limits.
        barSpacing: 11,
        minBarSpacing: 4,
        maxBarSpacing: 40,

        // Two slots of air after the newest bar.
        rightOffset: 2,

        // Refuse to scroll into whitespace on either side.
        fixLeftEdge: true,
        fixRightEdge: true,

        // A resize changes the spacing, not how much is shown.
        lockVisibleTimeRangeOnResize: true,

        // Zooming holds the newest bar in place instead of the centre.
        rightBarStaysOnScroll: true,

        // A new bar moves the view — only if the edge was already in sight.
        shiftVisibleRangeOnNewBar: true,

        // Axis chrome.
        borderVisible: true,
        borderColor: '#d4d4d4',
        ticksVisible: true,
        timeVisible: true,
        secondsVisible: false,
        allowBoldLabels: true,

        // And the labels themselves.
        tickMarkFormatter: (time) => {
            const date = new Date(time * 1000);
            const week = Math.ceil(((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);

            return `w${week}`;
        },
    },
});

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 })
    .setData(data.slice(0, 60).map((bar) => ({ time: bar.time, value: bar.value })));
```

</ChartDemo>

Try to drag past either end — it will not go, because both edges are fixed.

### `shiftVisibleRangeOnNewBar` is conditional, not automatic

On by default, and it does not do what its name suggests on its own: the view
moves when a bar arrives **only if the newest bar was already on screen**. Pan
back to March and the chart stays in March while ticks keep arriving.

That is almost always what you want and it surprises people who expected either
"always follow" or "never move". If you want the chart pinned to the live edge
regardless, call `scrollToRealTime()` on a button rather than fighting this
option.

### The crosshair's date tag

Rounded, with a point on the edge facing the plot, aimed at the column it
names — the same shape as a [price badge](/guide/markers#the-shape-of-a-badge)
turned ninety degrees. A label near either end of the axis slides inward to stay
on screen, and the point tracks the crosshair rather than the label's own
centre, so it goes on indicating the right bar.

### Writing the labels yourself

```js
chart.applyOptions({
    timeScale: {
        tickMarkFormatter: (time, tickType, locale) => {
            const date = new Date(time * 1000);

            return `W${weekOfYear(date)}`;
        },
    },
});
```

Return a string and it is used verbatim. Return nothing and the built-in
formatter answers, so you can override only the cases you care about.

## Zoom and pan

Both are on by default and both are options rather than facts:

```js
chart.applyOptions({
    handleScroll: {
        mouseWheel: true,        // wheel scrolls horizontally
        pressedMouseMove: true,  // drag the plot
        horzTouchDrag: true,
        vertTouchDrag: true,
    },
    handleScale: {
        mouseWheel: true,           // ctrl/⌘ + wheel, or pinch on a trackpad
        pinch: true,
        axisPressedMouseMove: true, // drag an axis to stretch it
        axisDoubleClickReset: true, // double-click an axis to reset it
    },
    kineticScroll: { touch: true, mouse: false },
});
```

Pass `false` for the whole group to switch the behaviour off entirely:

```js
chart.applyOptions({ handleScroll: false, handleScale: false });
```

A static chart — a sparkline, a thumbnail in a table — should do exactly that.
An interactive chart the reader cannot pan is worse than a picture, because it
invites a gesture and then ignores it.

## What next

- [Crosshair and interaction](/guide/interaction) — clicks, hovers and the
  magnet
- [Large datasets](/guide/performance) — what changes at half a million bars
- [Load history on scroll](/recipes/infinite-history) — the unclamped range,
  put to work
