# Chart options

Every option `createChart` and `chart.applyOptions` accept, with its default.
Nothing is omitted — if an option exists in the library it is on this page, and
a test fails the build if that stops being true.

```js
const chart = createChart(container, { /* any of the below */ });

chart.applyOptions({ /* merged into what is already set */ });
chart.options();   // the resolved tree
```

`applyOptions` merges one branch at a time, so passing `{ grid: { vertLines:
{ color: '#eee' } } }` leaves `horzLines` alone.

## Size

| option | default | |
|---|---|---|
| `width` | `0` | CSS pixels; ignored while `autoSize` is on |
| `height` | `0` | |
| `autoSize` | `false` | attach a `ResizeObserver` to the container and follow it |

`autoSize: true` is what you want in almost every application. Use `width` and
`height` for a fixed-size chart — a [sparkline](/recipes/sparkline) in a dense
table, where thirty observers would be thirty observers for nothing.

## Theme

| option | default | |
|---|---|---|
| `theme` | `null` | `'light'`, `'dark'`, or `'auto'` to follow the reader's system |

A dark chart by hand is nine values across five branches — background, text,
both grid colours, both crosshair colours, both crosshair **label backgrounds**,
and the axis borders. The label backgrounds are the ones almost everybody
misses: left dark under a dark theme, the price under the pointer becomes dark
text on a dark tag, which is the number the reader was reaching for.

```js
createChart(container, { theme: 'dark' });
```

<ChartDemo :height="300">

```js
chart.applyOptions({ theme: 'dark' });

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

**The palette is applied under your own options, never over them**, so this
means what it looks like it means:

```js
createChart(container, {
    theme: 'dark',
    grid: { vertLines: { visible: false } },   // still yours
});
```

Switch at runtime with `applyOptions`, which is all a site's dark-mode toggle
needs:

```js
chart.applyOptions({ theme: isDark ? 'dark' : 'light' });
```

### `'auto'`

Follows `prefers-color-scheme` and **keeps following it** — a reader who
switches their system while the chart is on screen sees it change. Where the
query is unavailable — a server render, an old browser — it falls back to
light, because a chart that cannot ask should not guess dark and hand back
white on white.

```js
createChart(container, { theme: 'auto' });
```

### Only two, deliberately

There is no way to register a third. A palette is a product decision, and a
library that accepts arbitrary ones ends up owning everyone's taste — anything
beyond light and dark is better written as the options it would have set
anyway. An unknown name is ignored rather than throwing: a typo in a colour
scheme should not take a chart down.

## Waiting for data

| option | default | |
|---|---|---|
| `loading` | `false` | say a request is in flight |
| `localization.emptyText` | `'No data'` | shown on an otherwise empty chart; `null` draws nothing |
| `localization.loadingText` | `'Loading…'` | shown instead while `loading` is set |

A chart with nothing to draw used to label a full price axis — `0.00` through
`1.00` — over a grid, with nothing to say the numbers were invented. On a
financial chart that is not an empty state; it is a chart stating prices it does
not have, and every consumer saw it for the length of their first fetch.

The axis is silent now when there is nothing to scale, and a line of text says
why.

<ChartDemo :height="240">

```js
// A chart with no series at all. Previously an axis reading 0.00 to 1.00.
chart.applyOptions({
    localization: {
        emptyText: 'No data for this period',
        loadingText: 'Fetching…',
    },
});

// Flip to the loading message after a moment, to show which one wins.
const waiting = setTimeout(() => chart.applyOptions({ loading: true }), 2000);

onCleanup(() => clearTimeout(waiting));

// So the page has something to compare against, a second chart with readings
// is built beside it.
const panel = document.createElement('div');

panel.style.cssText = 'position:absolute;inset:0 0 0 50%;border-left:1px solid #e5e5e5';
container.appendChild(panel);

const beside = createChart(panel, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, attributionLogo: false },
});

beside.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 })
    .setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

beside.timeScale().fitContent();

onCleanup(() => beside.remove());
```

</ChartDemo>

**`loading` is yours to set**, because only you know a request is in flight:

```js
chart.applyOptions({ loading: true });

const candles = await fetch(url).then((response) => response.json());

series.setData(candles);
chart.applyOptions({ loading: false });
```

Without it a chart flashes *"No data"* on its way to having some, which reads
as a failure that then corrects itself.

**Neither message covers a chart that already has readings.** Loading more
history is the common case, and hiding what is drawn in order to announce it
would be a worse chart than the one it replaced.

## layout

| option | default | |
|---|---|---|
| `layout.background` | `{ type: 'solid', color: '#ffffff' }` | see below |
| `layout.textColor` | `'#0a0a0a'` | axis labels |
| `layout.fontSize` | `12` | axis labels, in CSS pixels |
| `layout.fontFamily` | the system stack | any CSS `font-family` value |
| `layout.attributionLogo` | `true` | the Arincen Charts mark — [why](/attribution) |
| `layout.colorSpace` | `'srgb'` | canvas colour space; `'display-p3'` where supported |
| `layout.panes.enableResize` | `true` | **full build** — draggable pane dividers |
| `layout.panes.separatorColor` | `'#E0E3EB'` | **full build** |
| `layout.panes.separatorHoverColor` | `'rgba(178, 181, 189, 0.2)'` | **full build** |

### Background

```js
layout: { background: { type: 'solid', color: '#0a0a0a' } }

layout: {
    background: { type: 'gradient', topColor: '#171717', bottomColor: '#0a0a0a' },
}
```

`'transparent'` as a solid colour lets whatever is behind the canvas show
through, which is how a chart sits on a themed card without being told the
card's colour.

### `colorSpace`

`'display-p3'` renders in the wider gamut on hardware that has it. Colours you
specify in sRGB are unchanged; the difference shows only in saturated greens
and reds, and only on a P3 display. Leave it alone unless a designer asks.

## grid

| option | default | |
|---|---|---|
| `grid.vertLines.visible` | `true` | |
| `grid.vertLines.color` | `'#e5e5e5'` | |
| `grid.vertLines.style` | `LineStyle.Dotted` | |
| `grid.horzLines.visible` | `true` | |
| `grid.horzLines.color` | `'#e5e5e5'` | |
| `grid.horzLines.style` | `LineStyle.Dotted` | |

Vertical grid lines are drawn at the time axis' tick positions and horizontal
ones at the price axis'. Turning off one and keeping the other is common and
reads well — horizontal only, for a chart people read prices off.

## crosshair

Covered in full in [crosshair and interaction](/guide/interaction).

| option | default | |
|---|---|---|
| `crosshair.mode` | `CrosshairMode.Magnet` | `Normal`, `Magnet`, `MagnetOHLC`, `Hidden` |
| `crosshair.vertLine.visible` | `true` | |
| `crosshair.vertLine.color` | `'#737373'` | |
| `crosshair.vertLine.width` | `1` | |
| `crosshair.vertLine.style` | `LineStyle.Dotted` | |
| `crosshair.vertLine.labelVisible` | `true` | the tag on the time axis |
| `crosshair.vertLine.labelBackgroundColor` | `'#0a0a0a'` | |
| `crosshair.horzLine.*` | the same six | on the price axis |
| `crosshair.doNotSnapToHiddenSeriesIndices` | `true` | see below |
| `crosshair.dimOtherSeries` | `true` | fade the other series while one has the pointer |

### `doNotSnapToHiddenSeriesIndices`

In magnet mode the crosshair snaps to a series value. With this on — the
default — a series with `visible: false` is not a snap target, so the crosshair
does not jump to a price nobody can see.

Turn it off when a hidden series is still meaningful to the reader: an
indicator you draw yourself from a hidden source series, for instance.

### `dimOtherSeries`

A chart carrying four lines is asking the reader to follow one of them, and
nothing on it says which. With this on — the default — the series nearest the
pointer keeps its colour and the rest fade back, so the one being read comes
forward without anything being hidden.

It does nothing on a chart with a single series, and nothing while the pointer
is more than about fourteen pixels from any series: fading three lines because
the pointer drifted vaguely toward a fourth costs the reader the comparison
they came for and gives them no idea what they did to cause it.

Nearest is measured in pixels against every value a reading carries — open,
high, low and close, not only the close — so a candle claims the pointer
anywhere inside its body.

```js
chart.applyOptions({ crosshair: { dimOtherSeries: false } });
```

## Price scales

`rightPriceScale` and `leftPriceScale` take the same shape. The right one is
visible by default and the left is not. Full detail in
[price scales](/guide/price-scales).

| option | default | |
|---|---|---|
| `visible` | `true` right, `false` left | |
| `autoScale` | `true` | fit the visible data |
| `mode` | `PriceScaleMode.Normal` | `Logarithmic`, `Percentage`, `IndexedTo100` — **full build** |
| `invertScale` | `false` | high prices at the bottom |
| `alignLabels` | `true` | nudge labels apart so they never overlap |
| `entireTextOnly` | `false` | drop a label rather than clip it at the edge |
| `borderVisible` | `true` | |
| `borderColor` | `'#e5e5e5'` | |
| `scaleMargins` | `{ top: 0.16, bottom: 0.12 }` | fractions of the pane kept clear |
| `minimumWidth` | `0` | force a width, in CSS pixels |
| `ticksVisible` | `false` | small marks beside each label |

`minimumWidth` is the one people find late: two charts stacked with different
price magnitudes get axes of different widths, so their plots start at
different x positions and look unsynchronised. Set the same
`minimumWidth` on both. See
[synchronised charts](/recipes/synced-charts#align-the-price-scales-or-it-will-look-broken).

`invertScale` is for spreads and yields, where "up" means the number went down.

## timeScale

Covered in full in [the time scale](/guide/time-scale#options).

| option | default | |
|---|---|---|
| `visible` | `true` | |
| `borderVisible` / `borderColor` | `true` / `'#e5e5e5'` | |
| `barSpacing` | `8` | pixels per slot |
| `minBarSpacing` | `0.4` | zoom-out limit |
| `maxBarSpacing` | `0` | zoom-in limit; `0` uses the built-in ceiling |
| `rightOffset` | `0` | slots of empty space after the last bar |
| `shiftVisibleRangeOnNewBar` | `true` | follow new bars, if already at the edge |
| `rightBarStaysOnScroll` | `false` | hold the newest bar while zooming |
| `fixLeftEdge` / `fixRightEdge` | `false` | refuse to scroll past the data |
| `lockVisibleTimeRangeOnResize` | `false` | resize changes spacing, not span |
| `timeVisible` / `secondsVisible` | `false` | show a clock, and its seconds |
| `ticksVisible` | `false` | marks under the labels |
| `allowBoldLabels` | `true` | embolden a label starting a month or year |
| `tickMarkFormatter` | `null` | write the labels yourself |
| `enableConflation` | `false` | [large datasets](/guide/performance) |
| `conflationThresholdFactor` | `1` | higher merges sooner |

## localization

| option | default | |
|---|---|---|
| `localization.locale` | `'en'` | any BCP 47 tag; drives date and number formatting |
| `localization.priceFormatter` | `null` | `(price) => string` |
| `localization.percentageFormatter` | `null` | `(value) => string`, used in percentage mode |
| `localization.timeFormatter` | `null` | `(time) => string`, for the crosshair label |
| `localization.dateFormat` | `null` | a pattern, e.g. `'dd MMM yyyy'` |

```js
createChart(container, {
    localization: {
        locale: 'ar',
        priceFormatter: (price) => `${price.toFixed(2)} ر.س`,
        dateFormat: 'dd/MM/yyyy',
    },
});
```

A formatter here applies chart-wide. A single series can override it with its
own `priceFormat` — see [series options](/api/series-options#priceformat).

`timeFormatter` changes the crosshair's time label only; the axis labels are
`timeScale.tickMarkFormatter`, because the axis has to fit a label to a tick
width and the crosshair does not.

## handleScroll

| option | default | |
|---|---|---|
| `handleScroll.mouseWheel` | `true` | wheel scrolls the chart horizontally |
| `handleScroll.pressedMouseMove` | `true` | drag the plot to pan |
| `handleScroll.horzTouchDrag` | `true` | |
| `handleScroll.vertTouchDrag` | `true` | |

`handleScroll: false` switches the group off in one line.

## handleScale

| option | default | |
|---|---|---|
| `handleScale.mouseWheel` | `true` | ⌘/ctrl + wheel, and trackpad pinch |
| `handleScale.pinch` | `true` | touch pinch |
| `handleScale.axisPressedMouseMove` | `true` | drag an axis to stretch it |
| `handleScale.axisDoubleClickReset` | `true` | double-click an axis to reset it |

`handleScale: false` switches the group off.

`axisPressedMouseMove` also accepts `{ time: true, price: false }` when you
want one axis draggable and the other fixed.

## handleKeyboard

| option | default | |
|---|---|---|
| `handleKeyboard` | `true` | **full build** — focus, arrow keys and a live region |

See [keyboard and screen readers](/guide/interaction#keyboard-and-screen-readers).

## kineticScroll

| option | default | |
|---|---|---|
| `kineticScroll.touch` | `true` | momentum after a flick |
| `kineticScroll.mouse` | `false` | |

On for touch and off for the mouse, because momentum matches what a finger
feels like and does not match what a mouse feels like.

## trackingMode

| option | default | |
|---|---|---|
| `trackingMode.exitMode` | `'onTouchEnd'` | or `'onNextTap'` |

When the crosshair goes away on a touch device: as the finger lifts, or when
the reader taps somewhere else.

## What next

- [Series options](/api/series-options) — every option every series takes
- [API reference](/api/) — methods
- [The time scale](/guide/time-scale) · [Price scales](/guide/price-scales) ·
  [Interaction](/guide/interaction)
