# Custom series

::: tip Full build only
`chart.addCustomSeries` exists in `@arincen/charts/full`.
:::

Where a [primitive](/plugins/) decorates a chart that already draws
itself, a custom series **replaces the drawing entirely**. Stacked areas,
heatmaps and high-low-close bands are all written this way rather than built
in.

```js
import { createChart } from '@arincen/charts/full';

const chart = createChart(container);
const series = chart.addCustomSeries(myPaneView, { color: '#2962ff' });

series.setData(data);
```

## The pane view

```js
const myPaneView = {
    // Which prices the axis must accommodate. The last is treated as the
    // series' value for the price line and the last-value badge.
    priceValueBuilder: (row) => [row.low, row.high, row.close],

    // Points to skip: a time with no data.
    isWhitespace: (row) => row.close === undefined,

    // Merged over the common series defaults.
    defaultOptions: () => ({ priceLineVisible: false }),

    // Called once per frame with the visible bars.
    update(data, seriesOptions) {
        this.data = data;
    },

    renderer() {
        return {
            draw(target, priceToCoordinate) {
                target.useMediaCoordinateSpace(({ context }) => {
                    for (const bar of this.data.bars) {
                        const y = priceToCoordinate(bar.originalData.close);

                        context.lineTo(bar.x, y);
                    }

                    context.stroke();
                });
            },
        };
    },
};
```

A complete one, running — a high/low band with a close line through it, which
is not one of the seven built-in shapes:

<ChartDemo :height="320">

```js
// A pane view is a plain object. Nothing to extend, nothing to register.
const bandView = {
    // Every price the axis must make room for. The last one is treated as the
    // series' value for the price line and the last-value badge.
    priceValueBuilder: (row) => [row.low, row.high, row.close],

    // A row with no close is a gap: the slot is kept, nothing is drawn.
    isWhitespace: (row) => row.close === undefined,

    // Merged over the common series defaults.
    defaultOptions: () => ({ priceLineVisible: true, lastValueVisible: true }),

    // Once per frame, with the bars currently visible.
    update(viewData, options) {
        this.viewData = viewData;
        this.options = options;
    },

    renderer() {
        const state = this;

        return {
            draw(target, priceToCoordinate) {
                target.useMediaCoordinateSpace(({ context }) => {
                    const bars = state.viewData.bars;

                    if (! bars.length) {
                        return;
                    }

                    // The band.
                    context.beginPath();
                    bars.forEach((bar, index) => {
                        const y = priceToCoordinate(bar.originalData.high);

                        index === 0 ? context.moveTo(bar.x, y) : context.lineTo(bar.x, y);
                    });

                    for (let index = bars.length - 1; index >= 0; index--) {
                        const bar = bars[index];

                        context.lineTo(bar.x, priceToCoordinate(bar.originalData.low));
                    }

                    context.closePath();
                    context.fillStyle = state.options.bandColor;
                    context.fill();

                    // The close, through the middle of it.
                    context.beginPath();
                    bars.forEach((bar, index) => {
                        const y = priceToCoordinate(bar.originalData.close);

                        index === 0 ? context.moveTo(bar.x, y) : context.lineTo(bar.x, y);
                    });

                    context.strokeStyle = state.options.lineColor;
                    context.lineWidth = 2;
                    context.stroke();
                });
            },
        };
    },
};

const series = chart.addCustomSeries(bandView, {
    bandColor: 'rgba(192, 38, 211, 0.18)',
    lineColor: '#db2777',
});

series.setData(data.slice(-70).map((bar) => ({
    time: bar.time,
    high: bar.high,
    low: bar.low,
    close: bar.close,
})));

chart.timeScale().fitContent();
```

</ChartDemo>

Everything else works on it unchanged: the crosshair snaps to it, the price
line and last-value badge are drawn from `priceValueBuilder`'s last entry, and
autoscale makes room for the whole band because the builder listed the high and
the low.

## What `update` receives

```js
{
    bars: [{ x, time, originalData }],   // visible bars, already positioned
    barSpacing: 6.2,                      // CSS pixels between bar centres
    visibleRange: { from: 0, to: 140 },
}
```

`x` is a coordinate, not an index — the chart has already done the mapping.
`originalData` is your own row, untouched.

## The price converter

`draw` is handed a **function**, not a scale:

```js
draw(target, priceToCoordinate) {
    const y = priceToCoordinate(42);   // number, or null if it cannot be placed
}
```

This is deliberate. A view never needs to know whether it is drawing against a
linear, logarithmic or percentage axis — or which of several price scales it
belongs to.

## Autoscaling

`priceValueBuilder` is what keeps the axis honest. Return every price the row
occupies and the scale will accommodate all of them:

```js
priceValueBuilder: (row) => row.values,          // a stack
priceValueBuilder: (row) => [0, row.total],      // a bar standing on zero
```

Return too few and your series will be clipped by an axis that does not know
how tall it is.
