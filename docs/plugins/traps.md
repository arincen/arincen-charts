# Seven things that will catch you

None of these are in anyone's plugin documentation, including the library this
API is modelled on. Every one of them cost somebody an afternoon here first.

They are ordered by how long it takes to work out what is happening.

## 1. A hit does not claim the drag

You wrote `hitTest`, the cursor changes, you press the mouse — and the chart
pans while your drawing sits still.

That is not a bug. A hit says "this is under the pointer", not "this wants the
gesture", and most primitives are annotations the reader scrolls past. So the
plot drag stays the chart's.

**Switch panning off on `pointerdown`, and back on at `pointerup`:**

```js
chart.applyOptions({ handleScroll: { pressedMouseMove: false } });
```

The half of this that actually bites is the second half. Miss the restore and
the chart never pans again — which reads as "the chart broke", not "the plugin
broke", and is where the afternoon goes.

## 2. Mouse events do not fire for touch

`mousedown` works on your laptop and does nothing on every phone. The chart's
own handling is pointer-based throughout; a plugin that reaches for mouse
events works for you and for nobody on mobile.

```js
element.addEventListener('pointerdown', …);   // ✅
element.addEventListener('mousedown', …);     // ❌ desktop only
```

And listen for `pointermove`/`pointerup` on `window`, not on the chart element.
Drag faster than the frame rate and the pointer leaves the element mid-gesture;
listening on the element means you never see the release and the drawing sticks
to the cursor.

## 3. The autoscale runaway

```js
autoscaleInfo(from, to) {
    const range = series.priceScale().options();   // ❌

    return { priceRange: { minValue: range.min - 5, maxValue: range.max + 5 } };
}
```

Autoscale computes the range, you widen it, that becomes the range, you widen
it again. The chart zooms out on its own, forever, and it happens smoothly
enough to look like a physics bug rather than a feedback loop.

**Return the range of your own geometry, never a range derived from the current
one.** If your drawing is off screen, return `null` and take no part.

## 4. An axis badge can hide under your own axis drawing

A primitive may return `priceAxisViews` (the chart draws a badge) or
`priceAxisPaneViews` (you draw the strip). Returning both means you fill the
strip and then ask the chart to draw a badge into it — and they do not know
about each other, so the badge lands under your fill.

Pick one per strip. The badge is what you want unless a badge is not the shape.

## 5. A primitive that throws draws nothing, silently

Every hook — `paneViews`, `hitTest`, each axis view's `text()` and
`coordinate()` — runs inside a guard. If yours throws, it loses its own
drawing and the frame continues.

That is deliberate: third-party drawing code should not be able to blank the
chart it is drawn on. But it means a primitive that draws nothing looks
identical to one that is being ignored.

**Check the console before checking your maths.** More missing primitives are a
`TypeError` on a null coordinate than a layout mistake.

## 6. Media pixels and device pixels are not the same pixels

```js
target.useMediaCoordinateSpace(({ context }) => {
    context.fillRect(x, y, 1, height);    // ❌ a grey smear on retina
});
```

`priceToCoordinate` and `timeToCoordinate` return CSS pixels. A retina screen
has two device pixels per CSS pixel, so a 1px rectangle drawn in media space
straddles two physical pixels and is rendered as two half-intensity ones.

For anything hairline-thin, use bitmap space and scale explicitly:

```js
target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, bitmapSize }) => {
    context.fillRect(Math.round(x * horizontalPixelRatio), 0, 1, bitmapSize.height);
});
```

Fills, text and thick strokes are fine in media space. Do not convert
everything out of superstition — bitmap space means doing the ratio arithmetic
yourself, and that is its own source of bugs.

## 7. Nothing repaints because you changed your own state

The chart repaints on pan, zoom, resize and new data. It knows nothing about
your primitive's internals, so setting `this.price = 42` changes nothing until
something else happens to move the chart.

```js
attached({ requestUpdate }) {
    this.requestUpdate = requestUpdate;
},

setPrice(price) {
    this.price = price;
    this.requestUpdate?.();     // ← this
},
```

The symptom is a drawing that updates when you nudge the chart and not when you
change it, which reads as a caching problem and is not one.

## Two smaller ones

**Positions from arithmetic drift.** Computing `x` from a bar index and a
spacing you read once agrees with the chart until the first pan, zoom or right
offset, and then silently does not. Ask
`chart.timeScale().timeToCoordinate(time)` every frame; it is cheap and it is
correct.

**`updateAllViews` runs before drawing, once.** Recompute shared state there
rather than inside each renderer, or two views of the same primitive can
disagree about what frame they are in — a label reading one value while the
line it labels draws another.

## What next

- [Your first primitive](/plugins/first-primitive)
- [Hit testing and dragging](/plugins/hit-testing)
- [Custom series](/plugins/custom-series)
