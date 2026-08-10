# Panes

::: tip Full build only
Panes are in `@arincen/charts/full`.
:::

A pane is a plotting area with its own price scale and its own vertical slice
of the chart. Every chart has one; a chart in the full build can have more.

## Adding one

Panes are created by putting a series on one:

```js
import { createChart, CandlestickSeries, HistogramSeries } from '@arincen/charts/full';

const chart = createChart(container);

chart.addSeries(CandlestickSeries, {}, 0);   // price, pane 0
chart.addSeries(HistogramSeries, {}, 1);     // volume, pane 1 — created here
```

The third argument is the pane index. Asking for a pane that does not exist
creates it.

<ChartDemo :height="360">

```js
const price = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
}, 0);

// Pane 1 does not exist until this line asks for it.
const volume = chart.addSeries(HistogramSeries, {
    base: 0,
    priceLineVisible: false,
    lastValueVisible: false,
}, 1);

const bars = data.slice(-70);

price.setData(bars);
volume.setData(bars.map((bar, index) => ({
    time: bar.time,
    value: 1_200_000 + Math.abs(bar.close - bar.open) * 900_000 + (index % 7) * 90_000,
    color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.55)' : 'rgba(242, 54, 69, 0.55)',
})));

chart.timeScale().fitContent();
```

</ChartDemo>

Drag the divider between them. One time axis, one crosshair, two price scales —
and none of it wired up by hand, which is the difference between this and
[two synchronised charts](/recipes/synced-charts).

## Proportions, not pixels

Height is divided by **stretch factor**, not by a fixed pixel height. That is
what survives a resize: drag a divider, then resize the chart, and the split
you chose is still the split you get.

The first pane is worth two of any pane added after it, so an oscillator
dropped underneath a price chart takes a third of the height rather than half.

```js
const [price, volume] = chart.panes();

volume.getStretchFactor();      // what share it currently claims
volume.setStretchFactor(0.5);   // relative to the others
volume.getHeight();             // in CSS pixels, as laid out now
volume.setHeight(120);          // stored as the factor that produces it
```

`getStretchFactor` and `getHeight` answer different questions: the factor is
what you asked for and survives a resize, the height is what that came to in
this layout. Persisting a reader's chosen split means storing the **factor** —
store the height and a narrower window restores the wrong proportions.

## Resizing by hand

The divider between two panes is draggable, with a grab area wider than the
line itself. Turn it off with:

```js
createChart(container, { layout: { panes: { enableResize: false } } });
```

## The pane API

```js
const panes = chart.panes();

panes[1].paneIndex();
panes[1].getSeries();
panes[1].moveTo(0);              // reorder
panes[1].priceScale();
panes[1].chart();                // back to the chart that owns it
panes[1].attachPrimitive(p);     // draws on the whole pane, not one series
panes[1].detachPrimitive(p);
panes[1].getHTMLElement();       // the pane's own div
```

`getHTMLElement()` returns the element the pane occupies. It is there for
positioning your own DOM over one pane — a legend, a control, a badge — without
having to work out where that pane sits from the chart's own geometry:

```js
const legend = document.createElement('div');

legend.style.cssText = 'position:absolute;top:8px;left:12px;z-index:3';
panes[0].getHTMLElement().appendChild(legend);
```

Read it, position against it, and leave its contents to the chart.

`chart.removePane(index)` drops a pane. The first pane cannot be removed — it
owns the chart's main price scale — so removing it clears its series instead.

## The whole pane API, on buttons

<ChartDemo :height="420">

```js
chart.applyOptions({
    layout: {
        panes: {
            enableResize: true,
            separatorColor: '#d4d4d4',
            separatorHoverColor: 'rgba(219, 39, 119, 0.25)',
        },
    },
});

const price = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
}, 0);

const volume = chart.addSeries(HistogramSeries, {
    base: 0,
    priceLineVisible: false,
    lastValueVisible: false,
}, 1);

const bars = data.slice(-70);

price.setData(bars);
volume.setData(bars.map((bar, index) => ({
    time: bar.time,
    value: 1_200_000 + Math.abs(bar.close - bar.open) * 900_000 + (index % 7) * 90_000,
    color: bar.close >= bar.open ? 'rgba(34, 171, 148, 0.55)' : 'rgba(242, 54, 69, 0.55)',
})));

chart.timeScale().fitContent();

const bar = document.createElement('div');

bar.style.cssText = 'position:absolute;top:8px;left:10px;z-index:3;display:flex;gap:6px;flex-wrap:wrap';

// Positioned on the pane's own element rather than on the chart, which is what
// getHTMLElement is for.
chart.panes()[0].getHTMLElement().appendChild(bar);

const readout = document.createElement('div');

readout.style.cssText = 'position:absolute;bottom:8px;left:12px;z-index:3;'
    + 'font:11px/1.6 ui-monospace,monospace;color:#737373;pointer-events:none';
container.appendChild(readout);

const report = () => {
    const panes = chart.panes();

    readout.innerHTML = panes.map((pane) => (
        `pane ${pane.paneIndex()}  series ${pane.getSeries().length}`
        + `  height ${pane.getHeight().toFixed(0)}px`
        + `  stretch ${pane.getStretchFactor().toFixed(2)}`
    )).join('<br>') + `<br>plot ${JSON.stringify(chart.paneSize(0))}`;
};

const button = (label, run) => {
    const element = document.createElement('button');

    element.textContent = label;
    element.style.cssText = 'padding:4px 9px;border:1px solid #d4d4d4;border-radius:8px;'
        + 'background:#fff;color:#0a0a0a;font:600 11px system-ui;cursor:pointer';
    element.onclick = () => { run(); report(); };
    bar.appendChild(element);
};

button('taller volume', () => chart.panes()[1].setStretchFactor(1.2));
button('setHeight(90)', () => chart.panes()[1].setHeight(90));
button('swapPanes', () => chart.swapPanes(0, 1));
button('moveTo(0)', () => chart.panes()[1].moveTo(0));
button('addPane', () => chart.addPane());
button('removePane(last)', () => {
    const panes = chart.panes();

    if (panes.length > 1) {
        chart.removePane(panes.length - 1);
    }
});

report();
```

</ChartDemo>

Drag the divider — the hover colour is the pink one set at the top. Every
reading in the readout comes from a different method on `PaneApi`.

## The crosshair across panes

The vertical line runs the full height: the same bar is under the cursor
everywhere. The horizontal line stays in its own pane, because it is a price,
and a price only means something on the scale it was read from.
