# Svelte

Same shape as [React](/frameworks/react) and [Vue](/frameworks/vue): the chart
is an imperative object that owns a DOM node, and the component's job is to
create it, feed it and tear it down.

Svelte is the easiest of the three, because it has no reactive proxy to
accidentally wrap a chart in and no re-render to guard against. The two things
worth knowing are where the teardown goes and what `$effect` re-runs on.

## Svelte 5

```svelte
<script>
    import { createChart, AreaSeries } from '@arincen/charts';

    let { data = [] } = $props();
    let container;
    let series;

    $effect(() => {
        const chart = createChart(container, {
            autoSize: true,
            layout: { background: { type: 'solid', color: 'transparent' } },
        });

        series = chart.addSeries(AreaSeries, {
            lineColor: '#db2777',
            topColor: 'rgba(219, 39, 119, 0.3)',
            bottomColor: 'rgba(219, 39, 119, 0.02)',
        });

        // Returned from the effect, so it runs when the component goes.
        return () => chart.remove();
    });

    $effect(() => {
        series?.setData(data);
    });
</script>

<div bind:this={container} style="height: 320px"></div>
```

**Two effects, not one.** Put `setData(data)` inside the first and the whole
chart is destroyed and rebuilt every time a price arrives — the zoom resets,
the crosshair vanishes, and on a live feed that is once a second. The first
effect reads nothing reactive, so it runs once; the second reads `data`, so it
re-runs when the data changes and nothing else does.

## Svelte 4

```svelte
<script>
    import { onMount } from 'svelte';
    import { createChart, AreaSeries } from '@arincen/charts';

    export let data = [];

    let container;
    let chart;
    let series;

    onMount(() => {
        chart = createChart(container, { autoSize: true });
        series = chart.addSeries(AreaSeries, { lineColor: '#db2777' });

        return () => chart.remove();
    });

    // `$:` is Svelte 4's reactive statement, and it fires before onMount has
    // run at least once — hence the optional call.
    $: series?.setData(data);
</script>

<div bind:this={container} style="height: 320px"></div>
```

**Return the teardown from `onMount`.** Svelte calls it on destroy, and it is
the one place that cannot be forgotten in a page that swaps charts on a route
change. Two canvases and a `ResizeObserver` leak per chart otherwise, and it
presents as "the app gets slower the longer you use it".

## No `$state` on the chart

```js
let chart = $state(null);   // ❌
let chart;                  //  ✅
```

The chart is not state to render from — it is an object that renders itself, and
nothing in your markup reads a property off it. Svelte 5's `$state` uses a Proxy
just as Vue's `ref` does; a chart behind one still works, but every call goes
through a trap for no benefit and any identity comparison you make against it
will surprise you.

Keep it in a plain `let`. The same goes for the series.

## SvelteKit and SSR

`createChart` touches `document`, so it cannot run on the server.

`$effect` and `onMount` both run only in the browser, so the components above
are already safe. What is not safe is a top-level import in a `+page.server.js`
or any module the server evaluates — import the library inside the component,
as above, and never from server code.

For a heavy page, load it only when it is needed:

```svelte
<script>
    let Chart = $state(null);

    $effect(() => {
        import('./Chart.svelte').then((module) => { Chart = module.default; });
    });
</script>

{#if Chart}
    <Chart {data} />
{/if}
```

## Options that change

```svelte
<script>
    let { theme = 'light' } = $props();

    $effect(() => {
        chart?.applyOptions({ theme });
    });
</script>
```

`applyOptions` merges one branch at a time and never rebuilds the chart, which
is what makes a dark-mode toggle a one-liner rather than a remount.

## A store, if the data lives outside the component

```js
import { writable } from 'svelte/store';

export const candles = writable([]);
```

```svelte
<script>
    import { candles } from './candles.js';

    $effect(() => {
        series?.setData($candles);
    });
</script>
```

Nothing special about the chart here — it reads the store like anything else.
The point is that the chart never goes *into* a store: it is not serialisable,
it is not comparable, and a store holding one will be diffed by something
eventually.

## TypeScript

The package ships its own declarations; there is nothing to install.

```svelte
<script lang="ts">
    import { createChart, AreaSeries, type ChartApi, type SeriesApi } from '@arincen/charts';

    let chart: ChartApi | undefined;
    let series: SeriesApi | undefined;
</script>
```

## What next

- [Live data](/start/live-data) — `update` against `setData`
- [The two builds](/guide/two-builds) — when to import `@arincen/charts/full`
- [Recipes](/recipes/) — streaming, synchronised charts, sparklines
