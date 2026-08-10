# Vue

Same shape as [React](/frameworks/react): the chart is an imperative object
that owns a DOM node, and the component's job is to create it, feed it and tear
it down.

There is one Vue-specific trap, and it is the kind that produces a chart which
looks fine for a week and then stops updating. It is the last section on this
page, and it is the reason this page exists.

## The whole thing

```vue
<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue';
import { createChart, AreaSeries } from '@arincen/charts';

const props = defineProps({ data: { type: Array, default: () => [] } });

const container = ref(null);
const chart = shallowRef(null);
const series = shallowRef(null);

onMounted(() => {
    chart.value = createChart(container.value, {
        autoSize: true,
        layout: { background: { type: 'solid', color: 'transparent' } },
    });

    series.value = chart.value.addSeries(AreaSeries, {
        lineColor: '#db2777',
        topColor: 'rgba(219, 39, 119, 0.3)',
        bottomColor: 'rgba(219, 39, 119, 0.02)',
    });

    series.value.setData(props.data);
    chart.value.timeScale().fitContent();
});

onBeforeUnmount(() => {
    chart.value?.remove();
    chart.value = null;
});

watch(() => props.data, (next) => series.value?.setData(next));
</script>

<template>
    <div ref="container" style="height: 320px" />
</template>
```

## `shallowRef`, not `ref` — this is the trap

**`ref()` wraps its value in a deep reactive Proxy.** Vue then walks the object
making every nested property reactive, and hands you the proxy rather than the
object you put in.

For a chart that means:

- Vue recurses through the whole engine — series, scales, options, canvases
- Every method call goes through a proxy on every frame
- Identity comparisons stop holding: `param.seriesData.get(series.value)`
  returns `undefined`, because the `Map` is keyed by the real series and you
  are asking with a proxy of it

The last one is the one that hurts. Nothing throws. The chart draws. The
crosshair legend is simply always empty, and you go looking at your handler.

```js
const chart = shallowRef(null);    // ✅ the value is left alone
const chart = ref(null);           // ❌ proxied, and identity is gone
```

`shallowRef` keeps the reference reactive — assignment still triggers watchers —
without touching what it points at. Use it for the chart, every series, and any
plugin handle.

If you have to hand a chart object to something that will store it, `markRaw`
is the belt and braces:

```js
import { markRaw } from 'vue';

series.value = markRaw(chart.value.addSeries(AreaSeries, {}));
```

## Options that change

```js
watch(isDark, (dark) => {
    chart.value?.applyOptions({
        layout: { textColor: dark ? '#d1d4dc' : '#191919' },
        grid: {
            vertLines: { color: dark ? '#262626' : '#e6e6e6' },
            horzLines: { color: dark ? '#262626' : '#e6e6e6' },
        },
    });
});
```

`applyOptions` merges. Rebuilding the chart to change a colour discards the
reader's zoom and scroll position.

## Live updates

```js
let socket = null;

onMounted(() => {
    socket = new WebSocket(url);

    socket.addEventListener('message', (event) => {
        series.value?.update(JSON.parse(event.data));
    });
});

onBeforeUnmount(() => {
    socket?.close();
    chart.value?.remove();
});
```

## Watching data

```js
watch(() => props.data, (next) => series.value?.setData(next), { deep: false });
```

Leave `deep` off. A deep watcher on half a million readings walks half a
million readings every time anything changes, to tell you something you already
knew from the reference changing.

If your data is mutated in place rather than replaced, watch a version counter
instead:

```js
watch(() => props.version, () => series.value?.setData(props.data));
```

## Nuxt and SSR

The chart needs a canvas. On the server there is none:

```vue
<template>
    <ClientOnly>
        <PriceChart :data="data" />
    </ClientOnly>
</template>
```

Inside `onMounted` you are already on the client, so a component built like the
one above is safe by itself. `<ClientOnly>` matters when the import is
evaluated during server rendering.

## Resizing

```js
createChart(container.value, { autoSize: true });
```

A `ResizeObserver` on the container, removed by `chart.remove()`. No window
listener, no `useResizeObserver`.

## A composable

```js
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import { createChart } from '@arincen/charts';

export function useChart(options = {}) {
    const container = ref(null);
    const chart = shallowRef(null);

    onMounted(() => {
        chart.value = createChart(container.value, { autoSize: true, ...options });
    });

    onBeforeUnmount(() => {
        chart.value?.remove();
        chart.value = null;
    });

    return { container, chart };
}
```

## TypeScript

```ts
import { shallowRef } from 'vue';
import type { ChartApi, SeriesApi } from '@arincen/charts';

const chart = shallowRef<ChartApi | null>(null);
const series = shallowRef<SeriesApi | null>(null);
```

## What next

- [React](/frameworks/react)
- [No build step](/frameworks/script-tag) — a script tag and nothing else
- [Live data](/start/live-data)
