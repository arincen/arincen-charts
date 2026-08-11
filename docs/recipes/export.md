# Downloading the chart

Two calls, both full build: the picture, and the numbers behind it.

```js
chart.toImage();   // a PNG data URL
chart.toCSV();     // a spreadsheet, as a string
```

Neither downloads anything by itself. What a page does with a data URL — an
`<img>`, a download, an upload, a model — is the page's business, and a library
that reaches for the DOM to save a file is a library that has decided what your
save button looks like.

## Try it

Both buttons below are wired to those two calls. The picture opens in a new
tab; the CSV downloads.

<ChartDemo :height="360">

```js
const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
    title: 'ARN',
});

series.setData(data.slice(-90));
chart.timeScale().fitContent();

const bar = document.createElement('div');

bar.style.cssText = 'position:absolute;top:10px;left:12px;z-index:3;display:flex;gap:8px';
container.appendChild(bar);

const button = (label, onClick) => {
    const element = document.createElement('button');

    element.textContent = label;
    element.style.cssText = 'font:600 12px system-ui;padding:4px 12px;border-radius:999px;'
        + 'border:1px solid #db2777;color:#db2777;background:transparent;cursor:pointer';
    element.onclick = onClick;
    bar.appendChild(element);
};

button('PNG', async () => {
    // A white background, because the chart itself is transparent and a
    // transparent PNG lands on whatever colour the next document uses.
    const url = chart.toImage({ background: '#ffffff' });

    // Browsers refuse to *navigate* to a data URL, so opening one in a tab
    // gives a blank page. Turn it into a blob first — fetch reads a data URL
    // without touching the network.
    const blob = await fetch(url).then((response) => response.blob());
    const objectUrl = URL.createObjectURL(blob);

    window.open(objectUrl);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
});

button('CSV', () => {
    const blob = new Blob([chart.toCSV()], { type: 'text/csv' });
    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);
    link.download = 'arn.csv';
    link.click();

    URL.revokeObjectURL(link.href);
});
```

</ChartDemo>

## `toImage`

```js
chart.toImage({
    type: 'image/png',      // or 'image/jpeg', 'image/webp'
    quality: 0.92,          // lossy types only
    background: '#ffffff',  // painted underneath, for a transparent chart
});
```

Returns a data URL of **both canvases**, in order. A screenshot taken from the
visible canvas alone loses the crosshair and its labels — on a chart somebody is
pointing at, that is the part they meant to capture.

The picture is the size of the canvas as drawn, so a retina screen gives a
retina PNG. That is copied from the canvas rather than recomputed from
`devicePixelRatio`: the two agree until a window is dragged onto an external
monitor, and then a recomputed size crops the image.

::: warning A data URL cannot be opened in a tab
Browsers block top-level navigation to `data:` URLs, so
`window.open(chart.toImage())` gives you a blank page and no error. It is fine
as an `<img src>`, and fine as the `href` of an `<a download>`; to *open* it,
convert it first:

```js
const blob = await fetch(chart.toImage()).then((response) => response.blob());

window.open(URL.createObjectURL(blob));
```

`fetch` on a data URL does not touch the network.
:::

**Give it a `background` if your chart is transparent.** Ours are, and so are
most charts sitting on a styled page. A transparent PNG dropped into a document
or a chat window lands on whatever colour that document uses — often black text
on black.

## `toCSV`

```js
chart.toCSV({
    visible: false,    // true for only what is on screen
    separator: ',',    // ';' where commas are decimal points
});
```

One row per time, one column per series — the shape somebody opening it in
Excel expects, rather than one block per series stacked down the page.

```
time,AAPL,MSFT open,MSFT high,MSFT low,MSFT close
2024-01-01,100,1,3,0.5,2
2024-01-02,101.5,,,,
```

| | |
|---|---|
| a candlestick or bar series | four columns, from the series type rather than from its numbers — a day of dojis is still a candlestick |
| a series with no `title` | numbered: `series 1` |
| a series with no reading at that time | an empty cell, never the previous value: a gap in a feed is not a price that did not move |
| times | `2024-01-01`, or `2024-01-01 09:30:00` when the chart shows the clock |
| a title containing a comma or a quote | quoted and escaped |
| a chart with nothing on it | an empty string, not a lonely header |

**`visible: true` reads the current range**, so it exports what the reader is
looking at rather than everything you ever loaded. On a chart holding five
years and showing one month, that is the difference between a file somebody can
open and a file they have to filter.

## What next

- [Chart options](/api/chart-options) — the whole tree
- [Large datasets](/guide/performance) — what a chart holds before you export it
