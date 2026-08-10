# Drawing on the axes

A primitive can put things in the two strips outside the plot: a tag on the
price scale, a label under the time scale. That is how an alert level gets a
badge on the axis the way a price line does, and how a drawing tool labels the
date it is anchored to.

There are two ways to do it, and picking the wrong one is the most common
mistake on this page.

| | you give | the chart draws |
|---|---|---|
| **Axis views** | text, colours, a coordinate | the badge, styled like the built-in ones |
| **Axis pane views** | a renderer | whatever you draw, in that strip |

Use views. Reach for pane views only when a badge is not the shape you need.

## A badge on the price scale

```js
const alert = {
    paneViews: () => [ /* the rule across the plot */ ],

    priceAxisViews: () => [{
        coordinate: () => series.priceToCoordinate(level),
        text: () => level.toFixed(2),
        backColor: () => '#db2777',
        textColor: () => '#ffffff',
    }],
};
```

<ChartDemo :height="300">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2 });
const values = data.map((bar) => ({ time: bar.time, value: bar.value }));

series.setData(values);
chart.timeScale().fitContent();

function alertLevel(price, colour) {
    let series = null;

    return {
        attached({ series: s }) { series = s; },
        detached() { series = null; },

        // The rule across the plot.
        paneViews: () => [{
            zOrder: () => 'top',
            renderer: () => ({
                draw(target) {
                    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                        const y = series.priceToCoordinate(price);

                        if (y === null) {
                            return;
                        }

                        context.strokeStyle = colour;
                        context.lineWidth = 1;
                        context.setLineDash([4, 4]);
                        context.beginPath();
                        context.moveTo(0, y);
                        context.lineTo(mediaSize.width, y);
                        context.stroke();
                        context.setLineDash([]);
                    });
                },
            }),
        }],

        // The badge on the axis, drawn by the chart in the axis's own style.
        priceAxisViews: () => [{
            coordinate: () => series.priceToCoordinate(price),
            text: () => `alert ${price.toFixed(1)}`,
            backColor: () => colour,
            textColor: () => '#ffffff',
        }],
    };
}

const top = Math.max(...values.map((point) => point.value));

series.attachPrimitive(alertLevel(top - 4, '#ea580c'));
series.attachPrimitive(alertLevel(top - 12, '#0891b2'));
```

</ChartDemo>

### The view's shape

| method | required | |
|---|---|---|
| `coordinate()` | yes | y in CSS pixels within the plot |
| `text()` | yes | the label |
| `backColor()` | yes | badge background |
| `textColor()` | yes | badge text |
| `visible()` | no | return `false` to skip it this frame |
| `fixedCoordinate()` | no | overrides `coordinate()` when present |
| `tickVisible()` | no | return `false` to drop the small tick beside the badge |

**`coordinate()` returns pixels, not a price.** That is deliberate: the thing
being labelled need not be a price at all. A plugin marking a measured
distance already knows where its label goes in pixels, and making it express
that as a price the axis would immediately convert back is a round trip through
a scale that may be logarithmic.

Return a non-finite number and the badge is skipped for that frame, which is
the right behaviour while data is still loading.

## A label under the time scale

The same shape, with `coordinate()` returning **x**:

```js
timeAxisViews: () => [{
    coordinate: () => chart.timeScale().timeToCoordinate(time),
    text: () => 'earnings',
    backColor: () => '#ea580c',
    textColor: () => '#ffffff',
}],
```

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

function eventMark(time, label, colour) {
    let chart = null;

    return {
        attached({ chart: c }) { chart = c; },
        detached() { chart = null; },

        paneViews: () => [{
            zOrder: () => 'bottom',
            renderer: () => ({
                draw(target) {
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

        timeAxisViews: () => [{
            coordinate: () => chart.timeScale().timeToCoordinate(time),
            text: () => label,
            backColor: () => colour,
            textColor: () => '#ffffff',
        }],
    };
}

series.attachPrimitive(eventMark(values[70].time, 'Q1', '#ea580c'));
series.attachPrimitive(eventMark(values[130].time, 'Q2', '#0891b2'));
```

</ChartDemo>

## Drawing the strip yourself

When a badge is not the shape — a gradient scale, a histogram of volume by
price, a custom tick set — return a renderer instead:

```js
priceAxisPaneViews: () => [{
    zOrder: () => 'top',
    renderer: () => ({
        draw(target) {
            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                // (0, 0) is the top-left of the axis strip, not of the chart.
                context.fillStyle = 'rgba(219, 39, 119, 0.08)';
                context.fillRect(0, 0, mediaSize.width, mediaSize.height);
            });
        },
    }),
}],
```

`timeAxisPaneViews` is the same for the bottom strip.

**Coordinates are relative to the strip**, so `0, 0` is the strip's own corner.
That is what lets a renderer be written without knowing where the plot ends.

::: warning This one has caught us
Returning `priceAxisPaneViews` from a primitive that also returns
`priceAxisViews` means you are drawing the strip *and* asking the chart to draw
a badge in it. They do not know about each other, so the badge can land under
your fill and disappear.

Pick one per strip.
:::

## A view that throws costs its own label

Every view is called inside a guard. If `text()` throws, that label is skipped
and the axis, the other labels and the chart all continue.

This is deliberate — third-party drawing code should not be able to blank a
chart — and it makes bugs quiet. A badge that never appears is more often a
throwing `coordinate()` than a layout problem, so check the console before
checking your maths.

## What next

- [Hit testing and dragging](/plugins/hit-testing) — making an alert level
  draggable
- [Seven things that will catch you](/plugins/traps)
- [Custom series](/plugins/custom-series)
