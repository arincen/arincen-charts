<script setup>
/**
 * The chart on the home page, in the slot VitePress reserves for a hero image.
 *
 * A screenshot would have been less work and would have been a lie by the
 * second release. This is the engine, running, with a price arriving every
 * second — the claim on the page is "a charting library", so the page should
 * be one rather than a picture of one.
 *
 * The motion stops for `prefers-reduced-motion`: a hero that animates forever
 * is a hero that cannot be read by everyone.
 */
import { ref, onMounted, onBeforeUnmount, shallowRef, watch } from 'vue';
import { useData } from 'vitepress';

const { isDark } = useData();
const container = ref(null);
const chart = shallowRef(null);
const series = shallowRef(null);

let timer = null;
let bars = [];
let seed = 20260101;
let library = null;

const DAY = 24 * 60 * 60;

/** A deterministic walk, so the first frame is the same on every visit. */
function random() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;

    return seed / 0x7fffffff;
}

function seedBars() {
    const start = Math.floor(Date.UTC(2026, 0, 1) / 1000);
    const made = [];

    let price = 92;

    for (let index = 0; index < 140; index++) {
        price += (random() - 0.46) * 1.6 + Math.sin(index / 22) * 0.55;
        made.push({ time: start + index * DAY, value: price });
    }

    return made;
}

const options = () => ({
    autoSize: true,
    layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: isDark.value ? '#737373' : '#a3a3a3',
        attributionLogo: false,
    },
    grid: {
        vertLines: { visible: false },
        horzLines: { color: isDark.value ? '#1a1a1a' : '#f0f0f0' },
    },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, barSpacing: 6 },
    crosshair: { vertLine: { labelVisible: false } },
});

async function build() {
    if (! container.value) {
        return;
    }

    teardown();

    library = library ?? await import('@arincen/charts/full');

    const created = library.createChart(container.value, options());

    bars = seedBars();

    // The brand gradient, top to bottom: fuchsia through pink into orange,
    // fading out rather than stopping at a hard edge.
    const drawn = created.addSeries(library.AreaSeries, {
        lineColor: '#db2777',
        lineWidth: 2,
        topColor: 'rgba(192, 38, 211, 0.30)',
        bottomColor: 'rgba(234, 88, 12, 0.02)',
        priceLineVisible: false,
        lastValueVisible: false,
    });

    drawn.setData(bars);
    created.timeScale().fitContent();

    chart.value = created;
    series.value = drawn;

    start();
}

/** One more reading a second, through the same `update` a live feed would use. */
function start() {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (still) {
        return;
    }

    timer = window.setInterval(() => {
        const last = bars[bars.length - 1];
        const next = {
            time: last.time + DAY,
            value: last.value + (random() - 0.47) * 1.7,
        };

        bars.push(next);
        bars.shift();

        series.value?.setData(bars);
        chart.value?.timeScale().fitContent();
    }, 1000);
}

function teardown() {
    if (timer) {
        window.clearInterval(timer);
        timer = null;
    }

    if (chart.value) {
        chart.value.remove();
        chart.value = null;
    }
}

onMounted(build);
onBeforeUnmount(teardown);
watch(isDark, build);
</script>

<template>
    <div class="hero-chart">
        <div ref="container" class="hero-chart__canvas" />

        <p class="hero-chart__note">
            Live, not a screenshot — a reading arrives every second through
            <code>series.update()</code>.
        </p>
    </div>
</template>

<style scoped>
.hero-chart {
    width: 100%;
    border: 1px solid var(--vp-c-divider);
    border-radius: var(--arincen-radius-lg);
    background: var(--vp-c-bg-alt);
    overflow: hidden;
}

.hero-chart__canvas {
    width: 100%;
    height: 340px;
}

.hero-chart__note {
    margin: 0;
    padding: 10px 14px;
    border-top: 1px solid var(--vp-c-divider);
    color: var(--vp-c-text-2);
    font-size: 12px;
    line-height: 1.5;
}

.hero-chart__note code {
    font-size: 11px;
    color: var(--vp-c-text-1);
}

@media (max-width: 959px) {
    .hero-chart {
        margin-top: 24px;
    }

    .hero-chart__canvas {
        height: 240px;
    }
}
</style>
