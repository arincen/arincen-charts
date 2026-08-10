# Hit testing and dragging

A primitive that draws is a picture. A primitive the reader can point at,
grab and move is a tool. The difference is two methods and one thing the
chart deliberately does not do for you.

## Saying what is under the pointer

```js
hitTest(x, y) {
    const level = series.priceToCoordinate(price);

    if (level === null || Math.abs(y - level) > 5) {
        return null;
    }

    return {
        externalId: 'alert-1',
        cursorStyle: 'ns-resize',
        zOrder: 'top',
        distance: Math.abs(y - level),
    };
}
```

`x` and `y` are CSS pixels within the chart. Return `null` for a miss, or an
object describing the hit.

| field | |
|---|---|
| `externalId` | your identifier — comes back in crosshair and click handlers |
| `cursorStyle` | any CSS cursor; the chart sets it while you are hovered |
| `zOrder` | `'bottom'`, `'normal'`, `'top'` — higher layers win |
| `distance` | how far the pointer is; nearer wins within a layer |
| `hitTestPriority` | `2` marks a point handle, which beats a line at equal layer |

**Every primitive is asked and the best answer wins**, not the first. Two
overlapping drawings resolve the way they look rather than the order they were
attached in. Within a layer the nearest wins; a point handle beats a line so
that grabbing an endpoint is possible where a line crosses it.

`cursorStyle` is the whole of discoverability. A drawing that can be grabbed
and does not change the cursor is a drawing nobody will try to grab.

## Reading the hit

```js
chart.subscribeClick((param) => {
    if (param.hoveredObjectId === 'alert-1') {
        openAlertDialog();
    }
});

chart.subscribeCrosshairMove((param) => {
    highlight(param.hoveredObjectId);
});
```

`hoveredObjectId` is whatever you returned as `externalId`.

::: tip Taps work, not just hovers
The click handler hit-tests at the moment of the tap rather than reusing the
last hover. A touch produces no hover beforehand, so reusing it would make
every drawing selectable with a mouse and untouchable with a finger.
:::

## Dragging — the part the chart does not do

**A hit does not claim the gesture.** The chart pans on a plot drag, and it
will pan while your drawing is under the pointer, because "the pointer is over
a primitive" and "the reader wants to move that primitive" are not the same
statement — most drawings are annotations you scroll past.

So a draggable primitive turns panning off while it is being dragged, and back
on when it is done:

```js
function draggableLevel(initialPrice, colour) {
    let chart = null;
    let series = null;
    let requestUpdate = null;
    let price = initialPrice;
    let dragging = false;

    function onPointerMove(event) {
        if (! dragging) {
            return;
        }

        const box = chart.chartElement().getBoundingClientRect();
        const next = series.coordinateToPrice(event.clientY - box.top);

        if (next !== null) {
            price = next;
            requestUpdate();
        }
    }

    function onPointerUp() {
        if (! dragging) {
            return;
        }

        dragging = false;

        // Give panning back.
        chart.applyOptions({ handleScroll: { pressedMouseMove: true } });
    }

    return {
        attached(params) {
            chart = params.chart;
            series = params.series;
            requestUpdate = params.requestUpdate;

            chart.chartElement().addEventListener('pointerdown', (event) => {
                const box = chart.chartElement().getBoundingClientRect();
                const y = event.clientY - box.top;
                const level = series.priceToCoordinate(price);

                if (level === null || Math.abs(y - level) > 5) {
                    return;
                }

                dragging = true;

                // Take the gesture: without this the chart pans underneath.
                chart.applyOptions({ handleScroll: { pressedMouseMove: false } });
            });

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        },

        detached() {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            chart = null;
            series = null;
        },

        hitTest(x, y) {
            const level = series?.priceToCoordinate(price);

            if (level === null || level === undefined || Math.abs(y - level) > 5) {
                return null;
            }

            return { externalId: 'level', cursorStyle: 'ns-resize', zOrder: 'top', distance: Math.abs(y - level) };
        },

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
                        context.lineWidth = dragging ? 2 : 1;
                        context.beginPath();
                        context.moveTo(0, y);
                        context.lineTo(mediaSize.width, y);
                        context.stroke();
                    });
                },
            }),
        }],

        priceAxisViews: () => [{
            coordinate: () => series.priceToCoordinate(price),
            text: () => price.toFixed(2),
            backColor: () => colour,
            textColor: () => '#ffffff',
        }],
    };
}
```

Try it — grab the line and move it:

<ChartDemo :height="320">

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

let price = values[values.length - 1].value;
let dragging = false;
let host = null;
let owner = null;
let repaint = null;

const move = (event) => {
    if (! dragging) { return; }

    const box = host.chartElement().getBoundingClientRect();
    const next = owner.coordinateToPrice(event.clientY - box.top);

    if (next !== null) { price = next; repaint(); }
};

const up = () => {
    if (! dragging) { return; }

    dragging = false;
    host.applyOptions({ handleScroll: { pressedMouseMove: true } });
};

const level = {
    attached(params) {
        host = params.chart;
        owner = params.series;
        repaint = params.requestUpdate;

        host.chartElement().addEventListener('pointerdown', (event) => {
            const box = host.chartElement().getBoundingClientRect();
            const y = owner.priceToCoordinate(price);

            if (y === null || Math.abs(event.clientY - box.top - y) > 6) { return; }

            dragging = true;
            host.applyOptions({ handleScroll: { pressedMouseMove: false } });
        });

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    },

    detached() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
    },

    hitTest(x, y) {
        const level = owner?.priceToCoordinate(price);

        if (level === null || level === undefined || Math.abs(y - level) > 6) { return null; }

        return { externalId: 'level', cursorStyle: 'ns-resize', zOrder: 'top', distance: Math.abs(y - level) };
    },

    paneViews: () => [{
        zOrder: () => 'top',
        renderer: () => ({
            draw(target) {
                target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                    const y = owner.priceToCoordinate(price);

                    if (y === null) { return; }

                    context.strokeStyle = '#ea580c';
                    context.lineWidth = dragging ? 2 : 1;
                    context.setLineDash([5, 4]);
                    context.beginPath();
                    context.moveTo(0, y);
                    context.lineTo(mediaSize.width, y);
                    context.stroke();
                    context.setLineDash([]);
                });
            },
        }),
    }],

    priceAxisViews: () => [{
        coordinate: () => owner.priceToCoordinate(price),
        text: () => price.toFixed(2),
        backColor: () => '#ea580c',
        textColor: () => '#ffffff',
    }],
};

series.attachPrimitive(level);
onCleanup(() => series.detachPrimitive(level));
```

</ChartDemo>

## Three things that go wrong here

**Listening for `mousedown` instead of `pointerdown`.** Mouse events do not
fire for touch, so the drawing works on a laptop and is inert on every phone.
Use pointer events throughout.

**Listening for move and up on the chart element.** Drag faster than the frame
rate and the pointer leaves the element mid-gesture; the drawing sticks and
never releases. Listen on `window` for move and up, and only on the element for
down.

**Forgetting to give panning back.** If `pointerup` does not restore
`handleScroll.pressedMouseMove`, the chart stops panning forever after the
first drag — and it looks like the chart broke rather than like the plugin did.

## Contributing to the price range

A drawing above the data is clipped by autoscale, because autoscale is
computed from the series. A primitive can ask for room:

```js
autoscaleInfo(from, to) {
    return { priceRange: { minValue: price, maxValue: price } };
}
```

Called with the visible logical range so a drawing off screen can decline by
returning `null`.

::: warning The runaway
Do not return a range derived from the current visible range. Autoscale sets
the range, your primitive widens it, that becomes the new range, and it widens
again — the chart zooms out forever on its own. Return the range of *your own
geometry*, always.
:::

## What next

- [Seven things that will catch you](/plugins/traps)
- [Drawing on the axes](/plugins/axes)
- [Custom series](/plugins/custom-series)
