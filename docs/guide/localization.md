# Localization and typography

How numbers, dates and text come out — including in a language that reads right
to left.

## Everything at once

<ChartDemo :height="320">

```js
chart.applyOptions({
    localization: {
        // Drives the built-in date and number formatting.
        locale: 'de-DE',

        // Every price on the axis and in the crosshair label.
        priceFormatter: (price) => `${price.toFixed(2)} €`,

        // The crosshair's time label only — the axis has its own formatter.
        timeFormatter: (time) => new Date(time * 1000).toLocaleDateString('de-DE', {
            day: '2-digit', month: 'short', year: 'numeric',
        }),

        // The pattern the axis falls back to when no tickMarkFormatter is set.
        dateFormat: 'dd.MM.yyyy',

        // Used instead of priceFormatter when a scale is in percentage mode.
        percentageFormatter: (value) => `${value.toFixed(1).replace('.', ',')} %`,
    },
    layout: {
        fontSize: 13,
        fontFamily: 'Georgia, "Times New Roman", serif',
        colorSpace: 'srgb',
    },
    timeScale: { timeVisible: false },
});

chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 })
    .setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();
```

</ChartDemo>

Hover it: the crosshair's price carries a euro sign and its date is written the
German way, and the whole chart is set in a serif.

## Which formatter runs when

This is the part that costs people an afternoon, because there are four and
they do not overlap.

| formatter | applies to |
|---|---|
| `localization.priceFormatter` | every price, on every axis and label, chart-wide |
| `series.priceFormat` | one series — **overrides** the chart-wide one |
| `localization.percentageFormatter` | prices, but only while that scale is in `Percentage` mode |
| `localization.timeFormatter` | the crosshair's time label |
| `timeScale.tickMarkFormatter` | the labels along the time axis |

The last two are separate on purpose. An axis label has to fit inside a tick's
width and a crosshair label does not, so one is usually `Mar` and the other
`14 March 2026`.

A per-series `priceFormat` beats the chart-wide `priceFormatter`, which is how
a volume series abbreviates to `3.40M` on a chart whose prices carry a currency
symbol:

```js
chart.applyOptions({ localization: { priceFormatter: (p) => `$${p.toFixed(2)}` } });

chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' } });   // 3.40M, not $3,400,000.00
```

## `locale`

```js
createChart(container, { localization: { locale: 'ar' } });
```

Any BCP 47 tag. It is passed to the platform's own `Intl` formatting, so month
names, digit grouping and the decimal separator follow it without any
configuration of yours.

Set it even when you supply your own formatters — the parts you have not
overridden still use it.

## Right-to-left

Set an RTL locale and the chart follows it — **except the plot**, which never
mirrors.

```js
createChart(container, {
    localization: {
        locale: 'ar',
        priceFormatter: (price) => `${price.toFixed(2)} ر.س`,
    },
});
```

<ChartDemo :height="300">

```js
chart.applyOptions({
    localization: {
        locale: 'ar',
        priceFormatter: (price) => `${price.toFixed(2)} ر.س`,
    },
    timeScale: { timeVisible: false },
});

chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.28)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
}).setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();
```

</ChartDemo>

### What changes

The canvas is told which way its text runs, so a label mixing a month name with
digits is placed as one piece rather than reordered internally and then anchored
to the wrong end. It is set before anything is measured, because `measureText`
reads it too — and the price axis sizes itself from those widths, so setting it
later would lay the axis out under one direction and paint it under another.

The tooltip and the screen-reader live region are marked `dir` from the
**chart's** locale rather than the page's. A chart set to Arabic inside an
English page should still read as Arabic.

Recognised by language subtag, so `ar-SA` and `ar` are the same answer: Arabic,
Hebrew, Persian, Urdu, Pashto, Sindhi, Uyghur, Yiddish, Divehi and Kurdish.

### What does not

**The plot never mirrors.** Time runs left to right in every locale, and the
oldest reading is always on the left.

That is not an oversight and it is not us being lazy about RTL. Every Arabic
and Hebrew financial platform draws it this way, because a chart's horizontal
axis is not a line of text — it is a physical quantity, and a trader reading
several platforms at once needs them to agree. A mirrored chart would put the
newest bar where a reader of *any* language, including yours, looks for the
oldest.

### Moving the price axis does not move time

The two are independent, and this is worth stating because they look related:

```js
createChart(container, {
    localization: { locale: 'ar' },
    rightPriceScale: { visible: false },
    leftPriceScale: { visible: true },
});
```

Full build only. The axis moves to the left, the plot gets narrower on that
side, and **the months stay in the same order** — January still to the left of
February. Where the price labels sit is a layout choice; which way time runs is
not.

<ChartDemo :height="300">

```js
chart.applyOptions({
    localization: { locale: 'ar' },
    rightPriceScale: { visible: false },
    leftPriceScale: { visible: true },
    timeScale: { timeVisible: false },
});

chart.addSeries(AreaSeries, {
    priceScaleId: 'left',
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.28)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
}).setData(data.map((bar) => ({ time: bar.time, value: bar.value })));

chart.timeScale().fitContent();
```

</ChartDemo>

Your own DOM around the chart is yours. If you overlay a legend and it comes
out reversed, that is the page's `dir`, not the chart's.

## Typography

| option | default | |
|---|---|---|
| `layout.fontSize` | `12` | axis labels, in CSS pixels |
| `layout.fontFamily` | the system stack | any CSS `font-family` |
| `layout.textColor` | `'#0a0a0a'` | |

The font is used for axis labels, crosshair labels, price-line titles and
series titles. There is no separate setting per element — one font per chart,
deliberately, because a chart with three typefaces on it is a chart nobody
reads.

**A web font must be loaded before the chart draws**, or the first frame is
measured against a fallback and the axis is laid out for the wrong widths:

```js
await document.fonts.ready;

const chart = createChart(container, {
    layout: { fontFamily: 'Inter, sans-serif' },
});
```

## `colorSpace`

```js
createChart(container, { layout: { colorSpace: 'display-p3' } });
```

Renders the canvas in the wider gamut where the hardware has it. Your colours
are still written in sRGB; the difference shows only in saturated greens and
reds, and only on a P3 display. `'srgb'` is the default and is right unless a
designer asks otherwise.

## What next

- [Chart options](/api/chart-options) — the whole tree
- [Series options](/api/series-options#priceformat) — per-series formatting
- [The time scale](/guide/time-scale#writing-the-labels-yourself) —
  `tickMarkFormatter`
