<script setup>
/**
 * A live chart beside the code that drew it.
 *
 * The code is not a copy of what runs — it is what runs. The snippet is
 * compiled and executed against the real library, and the same string is what
 * the reader sees, so the example cannot drift from the page the way a
 * hand-written snippet does. Documentation that shows code which no longer
 * works is worse than documentation with no code in it, and the only reliable
 * way to prevent it is to make the page execute what it prints.
 *
 * The chart is built on the client only. VitePress renders these pages on the
 * server at build time, where there is no canvas.
 */
import { ref, onMounted, onBeforeUnmount, shallowRef, watch } from 'vue';
import { useData } from 'vitepress';

const props = defineProps({
    /** Chart height in pixels. */
    height: { type: Number, default: 300 },

    /** Start with the code folded away behind a toggle. */
    chartOnly: { type: Boolean, default: false },

    /** Which built-in dataset the snippet gets as `data`. */
    dataset: { type: String, default: 'daily' },
});

const { isDark } = useData();
const container = ref(null);
const root = ref(null);
const revealed = ref(false);
const failure = ref('');
const chart = shallowRef(null);
let library = null;
let cleanups = [];

/**
 * Deterministic sample data, so the same page looks the same on every reload
 * and a screenshot in a bug report matches what the reader sees.
 */
function makeData(kind) {
    const day = 24 * 60 * 60;
    const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);
    const count = kind === 'sparse' ? 14 : 180;
    const bars = [];

    let price = 100;
    let seed = 20240101;

    for (let index = 0; index < count; index++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;

        const noise = seed / 0x7fffffff - 0.5;
        const open = price;
        const close = open + noise * 2.4 + Math.sin(index / 18) * 0.9;

        bars.push({
            time: start + index * day * (kind === 'sparse' ? 30 : 1),
            open,
            close,
            high: Math.max(open, close) + Math.abs(noise) * 1.4,
            low: Math.min(open, close) - Math.abs(noise) * 1.4,
            value: close,
        });

        price = close;
    }

    return bars;
}

/**
 * The snippet, read back out of the rendered code block.
 *
 * The highlighter emits one span per line, and whether the newlines between
 * them survive `textContent` is an implementation detail of the highlighter
 * rather than something to rely on — so the lines are joined explicitly when
 * they are there.
 */
function readCode() {
    const block = root.value?.querySelector('.chart-demo__code code');

    if (! block) {
        return '';
    }

    const lines = block.querySelectorAll('.line');

    return lines.length
        ? Array.from(lines, (line) => line.textContent).join('\n')
        : block.textContent;
}

const themeOptions = () => ({
    autoSize: true,
    layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: isDark.value ? '#98989f' : '#67676c',
        attributionLogo: false,
    },
    grid: {
        vertLines: { color: isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
        horzLines: { color: isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
    },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false },
});

async function build() {
    if (! container.value) {
        return;
    }

    teardown();
    failure.value = '';

    try {
        library = library ?? await import('@arincen/charts/full');

        const created = library.createChart(container.value, themeOptions());

        chart.value = created;

        // The code is read back out of the page rather than passed in beside
        // it. Whatever the reader can see is the string that runs, so an
        // example cannot drift from its own output — there is only one copy.
        const source = readCode();

        if (! source.trim()) {
            return;
        }

        // Spread into scope so an example reads the way a reader's own file
        // would, instead of carrying an import line on every page. `onCleanup`
        // is the one addition: a streaming example starts a timer, and a timer
        // that outlives the page it was started on is a leak the reader would
        // inherit by copying the snippet.
        const run = new Function(
            'chart', 'container', 'lib', 'data', 'onCleanup',
            ...Object.keys(library),
            `"use strict";\n${source}`,
        );

        run(
            created,
            container.value,
            library,
            makeData(props.dataset),
            (fn) => cleanups.push(fn),
            ...Object.values(library),
        );
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    }
}

function teardown() {
    cleanups.forEach((fn) => {
        try {
            fn();
        } catch {
            // One example's cleanup must not strand another's.
        }
    });

    cleanups = [];

    if (chart.value) {
        try {
            chart.value.remove();
        } catch {
            // A chart that cannot be torn down should not stop the next one.
        }

        chart.value = null;
    }

    // Anything the snippet appended — a legend, a row of buttons — is left
    // behind by `chart.remove()`, which only owns what it made. Without this a
    // theme toggle leaves the previous run's controls stacked on the new one.
    container.value?.replaceChildren();
}

onMounted(build);
onBeforeUnmount(teardown);
watch(isDark, build);
</script>

<template>
    <div ref="root" class="chart-demo">
        <div ref="container" class="chart-demo__chart" :style="{ height: `${height}px` }" />

        <p v-if="failure" class="chart-demo__failure">
            This example failed to run: {{ failure }}
        </p>

        <button
            v-if="chartOnly"
            type="button"
            class="chart-demo__toggle"
            @click="revealed = ! revealed"
        >
            {{ revealed ? 'Hide the code' : 'Show the code that drew this' }}
        </button>

        <!--
            Always rendered, never removed: this block is where the running
            snippet is read from, so folding it away has to be a matter of
            display and not of whether it exists.
        -->
        <div v-show="! chartOnly || revealed" class="chart-demo__code">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.chart-demo {
    margin: 20px 0;
    border: 1px solid var(--vp-c-divider);
    border-radius: 10px;
    overflow: hidden;
}

.chart-demo__chart {
    width: 100%;
    background: var(--vp-c-bg-alt);

    /*
     * Positioned, so anything an example appends is contained.
     *
     * The chart builds its own wrapper inside this element and positions that;
     * this element itself was static, so a snippet's absolutely-placed legend
     * or button bar resolved against the page instead and landed hundreds of
     * pixels below, on top of whatever section happened to be there.
     */
    position: relative;
    overflow: hidden;
}

.chart-demo__failure {
    margin: 0;
    padding: 10px 16px;
    background: var(--vp-c-danger-soft);
    color: var(--vp-c-danger-1);
    font-size: 13px;
}

.chart-demo__toggle {
    display: block;
    width: 100%;
    padding: 8px 16px;
    border: 0;
    border-top: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-alt);
    color: var(--vp-c-text-2);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
}

.chart-demo__toggle:hover {
    color: var(--vp-c-brand-1);
}

.chart-demo__code :deep(div[class*='language-']) {
    margin: 0;
    border-radius: 0;
    border-top: 1px solid var(--vp-c-divider);
}
</style>
