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

## layout

| option | default | |
|---|---|---|
| `layout.background` | `{ type: 'solid', color: '#ffffff' }` | see below |
| `layout.textColor` | `'#191919'` | axis labels |
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
    background: { type: 'gradient', topColor: '#131722', bottomColor: '#0a0a0a' },
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
| `grid.vertLines.color` | `'#e6e6e6'` | |
| `grid.vertLines.style` | `LineStyle.Solid` | |
| `grid.horzLines.visible` | `true` | |
| `grid.horzLines.color` | `'#e6e6e6'` | |
| `grid.horzLines.style` | `LineStyle.Solid` | |

Vertical grid lines are drawn at the time axis' tick positions and horizontal
ones at the price axis'. Turning off one and keeping the other is common and
reads well — horizontal only, for a chart people read prices off.

## crosshair

Covered in full in [crosshair and interaction](/guide/interaction).

| option | default | |
|---|---|---|
| `crosshair.mode` | `CrosshairMode.Magnet` | `Normal`, `Magnet`, `MagnetOHLC`, `Hidden` |
| `crosshair.vertLine.visible` | `true` | |
| `crosshair.vertLine.color` | `'#9598a1'` | |
| `crosshair.vertLine.width` | `1` | |
| `crosshair.vertLine.style` | `LineStyle.LargeDashed` | |
| `crosshair.vertLine.labelVisible` | `true` | the tag on the time axis |
| `crosshair.vertLine.labelBackgroundColor` | `'#131722'` | |
| `crosshair.horzLine.*` | the same six | on the price axis |
| `crosshair.doNotSnapToHiddenSeriesIndices` | `true` | see below |

### `doNotSnapToHiddenSeriesIndices`

In magnet mode the crosshair snaps to a series value. With this on — the
default — a series with `visible: false` is not a snap target, so the crosshair
does not jump to a price nobody can see.

Turn it off when a hidden series is still meaningful to the reader: an
indicator you draw yourself from a hidden source series, for instance.

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
| `borderColor` | `'#d6dcde'` | |
| `scaleMargins` | `{ top: 0.2, bottom: 0.1 }` | fractions of the pane kept clear |
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
| `borderVisible` / `borderColor` | `true` / `'#d6dcde'` | |
| `barSpacing` | `6` | pixels per slot |
| `minBarSpacing` | `0.5` | zoom-out limit |
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
