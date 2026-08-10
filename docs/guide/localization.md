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

The chart draws left to right regardless of the page's direction, and that is
correct: time runs left to right in every locale, and a mirrored time axis
would put the newest bar where readers of *any* language look for the oldest.

What does follow the locale is the text.

```js
createChart(container, {
    localization: {
        locale: 'ar',
        priceFormatter: (price) => `${price.toFixed(2)} ر.س`,
    },
});
```

Put the chart's container in an `dir="ltr"` island if the surrounding page is
`rtl` and your own overlaid legends are coming out reversed. The canvas is
unaffected either way; only your DOM is.

## Typography

| option | default | |
|---|---|---|
| `layout.fontSize` | `12` | axis labels, in CSS pixels |
| `layout.fontFamily` | the system stack | any CSS `font-family` |
| `layout.textColor` | `'#191919'` | |

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
