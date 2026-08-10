# What a plugin is

Two extension points, and the difference between them is what you are
replacing.

| | you are | full build only |
|---|---|---|
| **Primitive** | drawing *over* a chart that already works | no |
| **Custom series** | replacing how a series draws entirely | yes |

A primitive is the one you want almost every time: bands, alert lines, session
shading, a trend line the reader can drag, a label on an axis. A custom series
is for when none of the seven built-in shapes is the shape — a heatmap, a
footprint chart, box plots.

Both are plain objects. There is no class to extend and nothing to register.

```js
const band = {
    updateAllViews: () => {},
    paneViews: () => [{
        zOrder: () => 'bottom',
        renderer: () => ({
            draw(target) {
                target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                    const top = series.priceToCoordinate(26);
                    const bottom = series.priceToCoordinate(25);

                    context.fillStyle = 'rgba(41, 98, 255, 0.15)';
                    context.fillRect(0, top, mediaSize.width, bottom - top);
                });
            },
        }),
    }],
};

series.attachPrimitive(band);
```

`series.detachPrimitive(band)` removes it again — and here it is, running:

<ChartDemo :height="280">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 });
const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);
chart.timeScale().fitContent();

const middle = values.reduce((total, point) => total + point.value, 0) / values.length;

const band = {
    updateAllViews: () => {},
    paneViews: () => [{
        zOrder: () => 'bottom',
        renderer: () => ({
            draw(target) {
                target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                    const top = series.priceToCoordinate(middle + 4);
                    const bottom = series.priceToCoordinate(middle - 4);

                    if (top === null || bottom === null) {
                        return;
                    }

                    context.fillStyle = 'rgba(192, 38, 211, 0.14)';
                    context.fillRect(0, top, mediaSize.width, bottom - top);
                });
            },
        }),
    }],
};

series.attachPrimitive(band);
onCleanup(() => series.detachPrimitive(band));
```

</ChartDemo>

## The lifecycle

| | when | for |
|---|---|---|
| `attached({ chart, series, requestUpdate })` | on attach | keeping references; `requestUpdate()` asks for a repaint |
| `updateAllViews()` | once per frame, before anything paints | recomputing state, so every view sees the same thing |
| `paneViews()` | once per layer | returning what to draw |
| `detached()` | on detach | cleaning up |

Only `paneViews` is required.

## Coordinate spaces

A renderer is handed a target, not a canvas, and asks it for the space it wants:

```js
draw(target) {
    // Device pixels. A one-pixel line stays one physical pixel on a retina
    // screen instead of blurring across two.
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio }) => {
        // …
    });

    // CSS pixels. Easier, and correct for anything that is not hairline-thin.
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        // …
    });
}
```

Use `useBitmapCoordinateSpace` when a pixel matters — thin lines, crisp edges.
Use `useMediaCoordinateSpace` for everything else.

## Layers

`zOrder()` returns `'bottom'`, `'normal'` or `'top'`.

- **bottom** — under the series. Bands, zones, watermarks.
- **normal** — over the series, under markers.
- **top** — over everything, including price lines. Alerts and labels.

## Positions come from the chart

Never assume where a bar is. Ask:

```js
attached: ({ chart }) => { this.chart = chart; },

// then, in draw:
const x = this.chart.timeScale().timeToCoordinate(point.time);
const y = series.priceToCoordinate(point.value);
```

Arithmetic over the array index agrees with the chart until the first pan,
zoom, or right offset — and then it silently does not.

## A primitive that throws does not take the chart down

If your renderer throws, it loses its own drawing and the frame continues.
Third-party drawing code should not be able to blank the chart it is drawn on.
This makes bugs quieter, so check the console rather than assuming a primitive
that draws nothing is being ignored.

## Where to go next

- [Your first primitive](/plugins/first-primitive) — a complete one, built up
- [Drawing on the axes](/plugins/axes) — labels on the price and time scales
- [Hit testing and dragging](/plugins/hit-testing) — making it interactive
- [Custom series](/plugins/custom-series) — replacing the drawing entirely
- [Seven things that will catch you](/plugins/traps) — read this before
  debugging anything

## Compatibility

The object shape is the one lightweight-charts uses for series primitives, so
drawing code written against that library generally runs here unmodified. That
is a deliberate convenience, not a compatibility promise — see
[Coming from lightweight-charts](/start/migrating).
