# Your first primitive

We are going to build a shaded band between two prices — the kind of thing used
for a value area, a support zone, or a target range. It is the smallest useful
primitive, and everything larger is this with more `draw` in it.

## The smallest thing that draws

A primitive is an object with `paneViews()`. Nothing else is required.

<ChartDemo :height="300">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 });

series.setData(data.map((bar) => ({ time: bar.time, value: bar.value })));
chart.timeScale().fitContent();

const values = data.map((bar) => bar.value);
const top = Math.max(...values) - 3;
const bottom = Math.min(...values) + 3;

const band = {
    paneViews: () => [{
        zOrder: () => 'bottom',
        renderer: () => ({
            draw(target) {
                target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                    const y1 = series.priceToCoordinate(top);
                    const y2 = series.priceToCoordinate(bottom);

                    if (y1 === null || y2 === null) {
                        return;
                    }

                    context.fillStyle = 'rgba(192, 38, 211, 0.12)';
                    context.fillRect(0, y1, mediaSize.width, y2 - y1);
                });
            },
        }),
    }],
};

series.attachPrimitive(band);
```

</ChartDemo>

Pan and zoom it. The band tracks the prices because `priceToCoordinate` is
asked again on every frame — it is never stored.

`series.detachPrimitive(band)` removes it.

## The four things it can implement

| | when it runs | what it is for |
|---|---|---|
| `attached({ chart, series, requestUpdate })` | once, on attach | keeping references |
| `updateAllViews()` | once per frame, before any drawing | recomputing shared state |
| `paneViews()` | once per frame, per layer | returning renderers |
| `detached()` | on detach | releasing what you held |

Only `paneViews` is required. Add the others when you need them, in that order.

## Step two: take the references instead of closing over them

The band above closes over `series`, which works and does not survive being
moved into its own file. Take what you need in `attached`:

```js
function priceBand(top, bottom, colour) {
    let chart = null;
    let series = null;

    return {
        attached({ chart: c, series: s }) {
            chart = c;
            series = s;
        },

        detached() {
            chart = null;
            series = null;
        },

        paneViews: () => [{
            zOrder: () => 'bottom',
            renderer: () => ({
                draw(target) {
                    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                        const y1 = series.priceToCoordinate(top);
                        const y2 = series.priceToCoordinate(bottom);

                        if (y1 === null || y2 === null) {
                            return;
                        }

                        context.fillStyle = colour;
                        context.fillRect(0, y1, mediaSize.width, y2 - y1);
                    });
                },
            }),
        }],
    };
}

series.attachPrimitive(priceBand(126, 120, 'rgba(192, 38, 211, 0.12)'));
```

Now it is a function you can publish. It knows nothing about the chart it will
be attached to.

## Step three: horizontal position

A band spans the whole width, so it never needed the time scale. Anything
anchored to a moment does:

<ChartDemo :height="300">

```js
const series = chart.addSeries(AreaSeries, {
    lineColor: '#db2777',
    topColor: 'rgba(192, 38, 211, 0.2)',
    bottomColor: 'rgba(234, 88, 12, 0.02)',
    lineWidth: 2,
});

const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);
chart.timeScale().fitContent();

// A vertical rule at one moment, drawn crisply.
function eventLine(time, colour) {
    let chart = null;

    return {
        attached({ chart: c }) { chart = c; },
        detached() { chart = null; },

        paneViews: () => [{
            zOrder: () => 'top',
            renderer: () => ({
                draw(target) {
                    // Device pixels: a one-pixel rule should be one physical
                    // pixel, not one and a half blurred across two.
                    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio }) => {
                        const x = chart.timeScale().timeToCoordinate(time);

                        if (x === null) {
                            return;
                        }

                        context.fillStyle = colour;
                        context.fillRect(Math.round(x * horizontalPixelRatio), 0, 1, bitmapSize.height);
                    });
                },
            }),
        }],
    };
}

series.attachPrimitive(eventLine(values[90].time, '#ea580c'));
series.attachPrimitive(eventLine(values[140].time, '#0891b2'));
```

</ChartDemo>

## The two coordinate spaces

```js
draw(target) {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => { /* CSS pixels */ });
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
        /* device pixels */
    });
}
```

**Media** is CSS pixels — the same numbers `priceToCoordinate` and
`timeToCoordinate` return. Use it for fills, text and anything thicker than a
hairline.

**Bitmap** is device pixels. On a retina screen there are two per CSS pixel, so
a 1px line drawn in media space lands across two physical pixels and looks
grey. Use bitmap space for thin lines and crisp edges, and multiply your
coordinates by the ratio you are given.

You can use both in one `draw`, in either order.

## Layers

```js
zOrder: () => 'bottom',   // under the series — bands, zones, shading
zOrder: () => 'normal',   // over the series, under markers
zOrder: () => 'top',      // over everything, including price lines
```

A primitive can return several views with different `zOrder` values — that is
how a band and its label end up on opposite sides of the data.

## Repainting when your own state changes

The chart repaints on pan, zoom, resize and data. It knows nothing about your
primitive's state, so when *that* changes, say so:

```js
attached({ requestUpdate }) {
    this.requestUpdate = requestUpdate;
},

setPrice(price) {
    this.price = price;
    this.requestUpdate?.();
},
```

Without the call your change appears the next time something else happens to
move the chart, which looks exactly like a caching bug.

## What next

- [Drawing on the axes](/plugins/axes) — a label on the price scale
- [Hit testing and dragging](/plugins/hit-testing) — making it grabbable
- [Seven things that will catch you](/plugins/traps)
