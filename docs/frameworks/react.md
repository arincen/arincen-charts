# React

There is no `<Chart>` component to install, and there does not need to be one.
The library is a class that owns a DOM node; React's job is to create it once,
feed it, and tear it down.

## The whole thing

```jsx
import { useEffect, useRef } from 'react';
import { createChart, AreaSeries } from '@arincen/charts';

export function PriceChart({ data }) {
    const container = useRef(null);
    const series = useRef(null);

    useEffect(() => {
        const chart = createChart(container.current, {
            autoSize: true,
            layout: { background: { type: 'solid', color: 'transparent' } },
        });

        series.current = chart.addSeries(AreaSeries, {
            lineColor: '#db2777',
            topColor: 'rgba(219, 39, 119, 0.3)',
            bottomColor: 'rgba(219, 39, 119, 0.02)',
        });

        return () => {
            chart.remove();
            series.current = null;
        };
    }, []);

    useEffect(() => {
        series.current?.setData(data);
    }, [data]);

    return <div ref={container} style={{ height: 320 }} />;
}
```

Two effects, deliberately. The first has `[]` — the chart is built once and
lives until the component goes. The second runs whenever the data changes and
touches only the data.

## The four rules

**1. The chart is not state.** It is an imperative object. `useRef`, never
`useState` — putting it in state re-renders on every assignment and buys
nothing, because React never renders it.

**2. Build it in an effect, not in the body.** The container does not exist
until React has committed the DOM.

**3. Return a cleanup function.** In development, Strict Mode mounts, unmounts
and remounts every component, so a missing cleanup shows up as two charts in
one container. That is Strict Mode working — it found a real leak that would
otherwise appear as a slow tab after twenty route changes.

**4. Give the container a height.** A `div` with no height is nought pixels
tall, and so is the chart in it.

## Options that change

Do not rebuild the chart. Apply them:

```jsx
useEffect(() => {
    chart.current?.applyOptions({
        layout: { textColor: dark ? '#d1d4dc' : '#191919' },
        grid: {
            vertLines: { color: dark ? '#262626' : '#e6e6e6' },
            horzLines: { color: dark ? '#262626' : '#e6e6e6' },
        },
    });
}, [dark]);
```

`applyOptions` merges, so passing one branch leaves the rest alone. Rebuilding
the chart to change a colour throws away the reader's zoom and scroll position,
which they will notice immediately.

## Live updates

```jsx
useEffect(() => {
    const socket = new WebSocket(url);

    socket.addEventListener('message', (event) => {
        series.current?.update(JSON.parse(event.data));
    });

    return () => socket.close();
}, [url]);
```

`update` in an effect, not in a render. A render that calls `update` runs twice
under Strict Mode and appends the same bar twice.

## Resizing

```js
createChart(container.current, { autoSize: true });
```

That is the whole answer. A `ResizeObserver` is attached to the container and
removed by `chart.remove()`. You do not need a `useLayoutEffect`, a window
listener, or a resize hook.

## Reading the crosshair into React state

This is the one place where the two worlds meet, and where it is easy to make
the chart slow:

```jsx
const [hovered, setHovered] = useState(null);

useEffect(() => {
    const handler = (param) => {
        if (! param.time) {
            setHovered(null);

            return;
        }

        setHovered(param.seriesData.get(series.current) ?? null);
    };

    chart.current.subscribeCrosshairMove(handler);

    return () => chart.current?.unsubscribeCrosshairMove(handler);
}, []);
```

That re-renders on every pointer move. It is fine for a small legend and it is
not fine if the subtree is large — if you feel it, write to a ref and a DOM
node directly instead, the way the
[interaction guide](/guide/interaction#a-legend-that-follows-the-pointer) does.
The chart itself is unaffected either way; the crosshair is a separate canvas.

## A reusable hook

```jsx
import { useEffect, useRef } from 'react';
import { createChart } from '@arincen/charts';

export function useChart(options) {
    const container = useRef(null);
    const chart = useRef(null);

    useEffect(() => {
        chart.current = createChart(container.current, { autoSize: true, ...options });

        return () => {
            chart.current.remove();
            chart.current = null;
        };
        // Options are applied below rather than watched here: a new object
        // literal on every render would rebuild the chart on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        chart.current?.applyOptions(options);
    }, [options]);

    return { container, chart };
}
```

```jsx
function Chart({ data }) {
    const { container, chart } = useChart({ timeScale: { barSpacing: 8 } });

    // …addSeries in an effect, using chart.current

    return <div ref={container} style={{ height: 320 }} />;
}
```

## Next.js and SSR

The chart needs a canvas, and the server has none. Load it on the client:

```jsx
import dynamic from 'next/dynamic';

const PriceChart = dynamic(() => import('./PriceChart'), { ssr: false });
```

Inside a `useEffect` you are already on the client, so the component above is
safe on its own — this only matters if you import the library at module scope
in a file the server evaluates.

## TypeScript

```tsx
import { useRef } from 'react';
import type { ChartApi, SeriesApi } from '@arincen/charts';

const chart = useRef<ChartApi | null>(null);
const series = useRef<SeriesApi | null>(null);
```

Types ship with the package. Nothing to install.

## What next

- [Vue](/frameworks/vue) — the same shapes, different lifecycle
- [Live data](/start/live-data)
- [A live streaming chart](/recipes/streaming)
