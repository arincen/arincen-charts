# Primitives

A primitive draws on a chart that already knows how to draw itself: bands,
alert lines, annotations, anything that sits over or under the data.

It is a plain object. There is no class to extend and nothing to register.

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

`series.detachPrimitive(band)` removes it again.

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

## Compatibility

The object shape is the one lightweight-charts uses for series primitives, so
drawing code written against that library generally runs here unmodified. That
is a deliberate convenience, not a compatibility promise — see
[Coming from lightweight-charts](/guide/migrating).
