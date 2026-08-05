/**
 * Every demo TradingView shows on the lightweight-charts landing page, rebuilt
 * against our engine.
 *
 * The page is the closest thing there is to a specification, so this doubles as
 * a parity audit: each option either draws, or says which phase it is waiting
 * on. Nothing here fakes a feature we do not have.
 *
 * Deliberately free of Vue and of any import from the engine — a demo takes the
 * library it should draw with as an argument. That keeps the set runnable from
 * a plain HTML page for verification, and lets the docs site reuse it later
 * without dragging the app along.
 */

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const THEMES = {
    light: {
        background: '#ffffff',
        text: '#191919',
        grid: '#e6e6e6',
        line: '#2962ff',
        area: ['rgba(41, 98, 255, 0.28)', 'rgba(41, 98, 255, 0)'],
    },
    dark: {
        background: '#1e1e20',
        text: '#d1d4dc',
        grid: '#2b2b43',
        line: '#4fd1c5',
        area: ['rgba(79, 209, 197, 0.28)', 'rgba(79, 209, 197, 0)'],
    },
    colorful: {
        background: '#160f2e',
        text: '#e9d8ff',
        grid: 'rgba(233, 216, 255, 0.12)',
        line: '#a855f7',
        area: ['rgba(168, 85, 247, 0.55)', 'rgba(168, 85, 247, 0.02)'],
    },
};

/**
 * @param {string} name
 * @param {Object} [extra]
 * @return {Object}
 */
function chartOptions(name, extra = {}) {
    const theme = THEMES[name] ?? THEMES.light;

    return {
        autoSize: true,
        layout: {
            background: { type: 'solid', color: theme.background },
            textColor: theme.text,
            fontFamily: FONT,
            attributionLogo: false,
        },
        grid: {
            vertLines: { visible: true, color: theme.grid },
            horzLines: { visible: true, color: theme.grid },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
        handleScroll: false,
        handleScale: false,
        ...extra,
    };
}

const closeOf = (point) => point.close ?? point.value;

/**
 * Simple moving average over the closing value, left-padded with whitespace so
 * the series still lines up with the bars it was computed from.
 *
 * @param {Object[]} points
 * @param {number} period
 * @return {Object[]}
 */
function movingAverage(points, period) {
    const result = [];
    let total = 0;

    points.forEach((point, index) => {
        total += closeOf(point);

        if (index >= period) {
            total -= closeOf(points[index - period]);
        }

        result.push(index >= period - 1
            ? { time: point.time, value: total / period }
            : { time: point.time });
    });

    return result;
}

/**
 * Volume the feed does not carry. Hashed off the index rather than stepped: a
 * modulo walks upward in a sawtooth and reads as a rendering bug.
 *
 * @param {Object[]} points
 * @return {Object[]}
 */
function syntheticVolume(points) {
    return points.map((point, index) => {
        const noise = Math.sin(index * 12.9898) * 43758.5453;

        return { time: point.time, value: Math.round(800 + (noise - Math.floor(noise)) * 4200) };
    });
}

/**
 * Plausible sibling instruments for the comparison demos — the same walk pushed
 * through different phases, so the lines diverge and cross the way real
 * comparisons do.
 *
 * @param {Object[]} points
 * @param {number} seed
 * @return {Object[]}
 */
function relatedSeries(points, seed) {
    let drift = 0;

    return points.map((point, index) => {
        drift += Math.sin((index + seed * 7) / (6 + seed)) * 0.35;

        return { time: point.time, value: closeOf(point) * (1 + drift / 40) };
    });
}

const COMPARE_COLOURS = ['#2962ff', '#e91e63', '#00bcd4', '#ff9800', '#8e24aa'];

/**
 * Standard deviation band around a moving average, drawn as a primitive rather
 * than as series — this is what TradingView's "bands indicator" plugin is, and
 * it is the same object shape lightweight-charts takes.
 *
 * @param {Object} series
 * @param {Object[]} average
 * @param {number} width
 * @param {string} colour
 * @return {Object}
 */
function bandsPrimitive(series, band, colours) {
    let chart = null;

    return {
        attached: (param) => { chart = param.chart; },
        detached: () => { chart = null; },
        updateAllViews: () => {},
        paneViews: () => [{
            zOrder: () => 'bottom',
            renderer: () => ({
                draw(target) {
                    target.useMediaCoordinateSpace(({ context }) => {
                        if (! chart) {
                            return;
                        }

                        // Positions come from the time scale rather than from
                        // an assumed even spread: the moment the chart is
                        // panned, zoomed, or given a right offset, arithmetic
                        // over the array index stops agreeing with the bars.
                        const timeScale = chart.timeScale();
                        const edge = (key, reverse) => {
                            const rows = reverse ? [...band].reverse() : band;

                            for (const row of rows) {
                                if (row[key] === undefined) {
                                    continue;
                                }

                                const x = timeScale.timeToCoordinate(row.time);
                                const y = series.priceToCoordinate(row[key]);

                                if (Number.isFinite(x) && Number.isFinite(y)) {
                                    context.lineTo(x, y);
                                }
                            }
                        };

                        context.beginPath();
                        edge('upper', false);
                        edge('lower', true);
                        context.closePath();
                        context.fillStyle = colours.fill;
                        context.fill();

                        // Edges drawn as well as the fill: a wash alone hides
                        // exactly the thing a band is read for, which is where
                        // it tightens and where it flares.
                        context.lineWidth = 1.5;
                        context.strokeStyle = colours.edge;

                        for (const key of ['upper', 'lower']) {
                            context.beginPath();
                            edge(key, false);
                            context.stroke();
                        }

                        context.beginPath();
                        edge('middle', false);
                        context.strokeStyle = colours.middle;
                        context.setLineDash([4, 3]);
                        context.stroke();
                        context.setLineDash([]);
                    });
                },
            }),
        }],
    };
}

/**
 * Rolling mean and standard deviation, so the band breathes with volatility
 * instead of sitting at a fixed width the way a constant offset would.
 *
 * @param {Object[]} points
 * @param {number} period
 * @param {number} deviations
 * @return {{time: *, upper: number, middle: number, lower: number}[]}
 */
function volatilityBand(points, period, deviations) {
    return points.map((point, index) => {
        if (index < period - 1) {
            return { time: point.time };
        }

        const window = points.slice(index - period + 1, index + 1).map(closeOf);
        const mean = window.reduce((sum, value) => sum + value, 0) / period;
        const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
        const spread = Math.sqrt(variance) * deviations;

        return { time: point.time, upper: mean + spread, middle: mean, lower: mean - spread };
    });
}

/**
 * A price line that starts at the last bar instead of crossing the whole plot.
 *
 * @param {Object} series
 * @param {number} price
 * @param {string} colour
 * @return {Object}
 */
function partialPriceLinePrimitive(series, time, price, colour) {
    let chart = null;

    return {
        attached: (param) => { chart = param.chart; },
        detached: () => { chart = null; },
        updateAllViews: () => {},
        paneViews: () => [{
            zOrder: () => 'top',
            renderer: () => ({
                draw(target) {
                    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                        const y = series.priceToCoordinate(price);
                        const x = chart ? chart.timeScale().timeToCoordinate(time) : null;

                        if (! Number.isFinite(y) || ! Number.isFinite(x)) {
                            return;
                        }

                        // The whole point of the plugin: the line begins at the
                        // last bar and runs right, rather than crossing history
                        // it was never true for.
                        context.save();
                        context.strokeStyle = colour;
                        context.fillStyle = colour;
                        context.lineWidth = 2;
                        context.setLineDash([3, 3]);
                        context.beginPath();
                        context.moveTo(x, y);
                        context.lineTo(mediaSize.width, y);
                        context.stroke();
                        context.setLineDash([]);
                        context.beginPath();
                        context.arc(x, y, 4, 0, Math.PI * 2);
                        context.fill();
                        context.restore();
                    });
                },
            }),
        }],
    };
}

/**
 * @param {string} text
 * @param {string} colour
 * @return {Object}
 */
function watermarkPrimitive(text, colour) {
    return {
        updateAllViews: () => {},
        paneViews: () => [{
            zOrder: () => 'bottom',
            renderer: () => ({
                draw(target) {
                    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                        context.save();
                        context.font = `bold 30px ${FONT}`;
                        context.fillStyle = colour;
                        context.textAlign = 'center';
                        context.textBaseline = 'middle';
                        context.fillText(text, mediaSize.width / 2, mediaSize.height / 2);
                        context.restore();
                    });
                },
            }),
        }],
    };
}

/**
 * Area chart shared by most demos, so a card only has to describe what makes it
 * different.
 *
 * @param {Object} ctx
 * @param {Object} [options]
 * @param {Object} [seriesOptions]
 * @return {{chart: Object, series: Object}}
 */
function areaChart(ctx, options = {}, seriesOptions = {}) {
    const theme = THEMES[options.theme ?? 'light'];
    const chart = ctx.lib.createChart(ctx.container, chartOptions(options.theme ?? 'light', options.chart));
    const series = chart.addSeries(ctx.lib.AreaSeries, {
        lineColor: theme.line,
        topColor: theme.area[0],
        bottomColor: theme.area[1],
        lineWidth: 2,
        ...seriesOptions,
    });

    series.setData(options.data ?? ctx.points);
    chart.timeScale().fitContent();

    return { chart, series };
}

const PHASE_4 = 'Phase 4';
const NOT_LIBRARY = 'your code';

/* ------------------------------------------------------- custom series views */

/**
 * A custom series is a pane view: the library asks it for the prices to scale
 * against, then hands it a canvas and a price converter and stays out of the
 * way. None of the three chart types below is a feature of either library —
 * they are what the extension point is for.
 */
/**
 * Tuned for a light background rather than borrowed from a dark one. The same
 * hues that glow on near-black go muddy on white, so each layer carries a
 * saturated line over a washed fill instead of a flat block of colour — which
 * is also what lets you read the shape of a layer, not just its thickness.
 */
const STACK_LAYERS = [
    { line: '#2962ff', fill: 'rgba(41, 98, 255, 0.30)' },
    { line: '#e5395f', fill: 'rgba(229, 57, 95, 0.30)' },
    { line: '#f59e0b', fill: 'rgba(245, 158, 11, 0.32)' },
    { line: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.30)' },
    { line: '#00897b', fill: 'rgba(0, 137, 123, 0.30)' },
];

function stackedAreaView() {
    let data = null;

    const cumulative = (row) => row.values.reduce(
        (running, value) => [...running, running[running.length - 1] + value],
        [0],
    );

    return {
        priceValueBuilder: (row) => [0, cumulative(row)[row.values.length]],
        isWhitespace: (row) => ! Array.isArray(row.values),
        defaultOptions: () => ({ priceLineVisible: false, lastValueVisible: true }),
        update: (next) => { data = next; },
        renderer: () => ({
            draw(target, priceToCoordinate) {
                target.useMediaCoordinateSpace(({ context }) => {
                    if (! data?.bars.length) {
                        return;
                    }

                    const stacks = data.bars.map((bar) => cumulative(bar.originalData));
                    const edge = (level, reverse) => {
                        const bars = reverse ? [...data.bars].reverse() : data.bars;

                        bars.forEach((bar, position) => {
                            const index = reverse ? data.bars.length - 1 - position : position;
                            const y = priceToCoordinate(stacks[index][level]);

                            if (y !== null) {
                                context.lineTo(bar.x, y);
                            }
                        });
                    };

                    // Each band is drawn between its own two levels rather than
                    // down to the baseline. Filling to the baseline would stack
                    // five translucent layers on top of one another and turn the
                    // bottom of the chart to mud.
                    STACK_LAYERS.forEach((layer, level) => {
                        context.beginPath();
                        edge(level + 1, false);
                        edge(level, true);
                        context.closePath();
                        context.fillStyle = layer.fill;
                        context.fill();

                        context.beginPath();
                        edge(level + 1, false);
                        context.strokeStyle = layer.line;
                        context.lineWidth = 2;
                        context.stroke();
                    });
                });
            },
        }),
    };
}

function hlcAreaView() {
    let data = null;

    return {
        priceValueBuilder: (row) => [row.low, row.high, row.close],
        isWhitespace: (row) => row.close === undefined,
        defaultOptions: () => ({ priceLineVisible: false, lastValueVisible: true }),
        update: (next) => { data = next; },
        renderer: () => ({
            draw(target, priceToCoordinate) {
                target.useMediaCoordinateSpace(({ context }) => {
                    if (! data?.bars.length) {
                        return;
                    }

                    const edge = (key, reverse) => {
                        const bars = reverse ? [...data.bars].reverse() : data.bars;

                        for (const bar of bars) {
                            const y = priceToCoordinate(bar.originalData[key]);

                            if (y !== null) {
                                context.lineTo(bar.x, y);
                            }
                        }
                    };

                    context.beginPath();
                    edge('high', false);
                    edge('low', true);
                    context.closePath();
                    context.fillStyle = 'rgba(41, 98, 255, 0.18)';
                    context.fill();

                    context.beginPath();
                    edge('close', false);
                    context.strokeStyle = '#2962ff';
                    context.lineWidth = 2;
                    context.stroke();
                });
            },
        }),
    };
}

/**
 * A ramp rather than one hue at varying opacity. Alpha alone reads as "more or
 * less of the same thing"; a hue shift reads as a scale, which is the whole
 * reason to draw a heatmap instead of a line.
 */
const HEAT_STOPS = [
    { at: 0, colour: [219, 234, 254] },
    { at: 0.45, colour: [96, 165, 250] },
    { at: 0.75, colour: [251, 191, 36] },
    { at: 1, colour: [220, 38, 38] },
];

function heatColour(amount) {
    const level = Math.max(0, Math.min(1, amount));
    const upper = HEAT_STOPS.find((stop) => stop.at >= level) ?? HEAT_STOPS[HEAT_STOPS.length - 1];
    const lower = [...HEAT_STOPS].reverse().find((stop) => stop.at <= level) ?? HEAT_STOPS[0];
    const span = upper.at - lower.at || 1;
    const ratio = (level - lower.at) / span;
    const channel = (index) => Math.round(lower.colour[index] + (upper.colour[index] - lower.colour[index]) * ratio);

    return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

function heatmapView() {
    let data = null;

    return {
        priceValueBuilder: (row) => row.cells.flatMap((cell) => [cell.low, cell.high]),
        isWhitespace: (row) => ! Array.isArray(row.cells),
        defaultOptions: () => ({ priceLineVisible: false, lastValueVisible: false }),
        update: (next) => { data = next; },
        renderer: () => ({
            draw(target, priceToCoordinate) {
                target.useMediaCoordinateSpace(({ context }) => {
                    if (! data?.bars.length) {
                        return;
                    }

                    const width = Math.max(1, data.barSpacing * 0.9);

                    for (const bar of data.bars) {
                        for (const cell of bar.originalData.cells) {
                            const top = priceToCoordinate(cell.high);
                            const bottom = priceToCoordinate(cell.low);

                            if (top === null || bottom === null) {
                                continue;
                            }

                            context.fillStyle = heatColour(cell.amount);
                            context.fillRect(bar.x - width / 2, top, width, Math.max(1, bottom - top));
                        }
                    }
                });
            },
        }),
    };
}

export const DEMOS = [
    {
        key: 'chart-type',
        title: 'Chart type',
        blurb: 'All six series lightweight-charts ships.',
        options: [
            { label: 'Candles', build: (ctx) => candleDemo(ctx) },
            { label: 'Line', build: (ctx) => simpleSeries(ctx, 'LineSeries', { color: '#2962ff', lineWidth: 2 }) },
            { label: 'Bars', build: (ctx) => simpleSeries(ctx, 'BarSeries', {}) },
            { label: 'Area', build: (ctx) => areaChart(ctx) },
            { label: 'Baseline', build: (ctx) => baselineDemo(ctx) },
            { label: 'Histogram', build: (ctx) => simpleSeries(ctx, 'HistogramSeries', { color: '#26a69a' }) },
        ],
    },
    {
        key: 'custom-theme',
        title: 'Custom theme',
        blurb: 'Every colour is an option. Nothing here is a special theme mode.',
        options: [
            { label: 'Dark', build: (ctx) => areaChart(ctx, { theme: 'dark' }) },
            { label: 'Light', build: (ctx) => areaChart(ctx, { theme: 'light' }) },
            { label: 'Colorful', build: (ctx) => areaChart(ctx, { theme: 'colorful' }) },
        ],
    },
    {
        key: 'range-switcher',
        title: 'Range switcher',
        blurb: 'setData plus fitContent. The buttons are yours; the redraw is ours.',
        options: [20, 60, 120, 0].map((count) => ({
            label: count === 0 ? 'All' : `${count} bars`,
            build: (ctx) => areaChart(ctx, { data: count === 0 ? ctx.points : ctx.points.slice(-count) }),
        })),
    },
    {
        key: 'legend',
        title: 'Legend',
        blurb: 'An HTML overlay fed by subscribeCrosshairMove. Not a library feature on either side.',
        badge: NOT_LIBRARY,
        options: [
            { label: '1-line legend', build: (ctx) => legendDemo(ctx, 1) },
            { label: '3-line legend', build: (ctx) => legendDemo(ctx, 3) },
        ],
    },
    {
        key: 'series-compare',
        title: 'Series compare',
        blurb: 'Several series on one price scale, in percentage mode so they start together.',
        options: [2, 3, 4, 5].map((count) => ({
            label: `${count} series`,
            build: (ctx) => compareDemo(ctx, count),
        })),
    },
    {
        key: 'additional-options',
        title: 'Additional options',
        blurb: 'Watermarks are a primitive on our side, the same as they are in lightweight-charts v5.',
        options: [
            { label: 'Go to realtime button', build: (ctx) => realtimeButtonDemo(ctx) },
            { label: 'Custom watermark', build: (ctx) => watermarkDemo(ctx) },
        ],
    },
    {
        key: 'data-tooltip',
        title: 'Data tooltip',
        blurb: 'Crosshair events with an HTML box on top. On a touch screen the crosshair sits above your finger.',
        badge: NOT_LIBRARY,
        options: [
            { label: 'Floating tooltip', build: (ctx) => tooltipDemo(ctx, false) },
            { label: 'Tracking tooltip', build: (ctx) => tooltipDemo(ctx, true) },
            { label: 'Magnifier tooltip', build: (ctx) => magnifierDemo(ctx) },
        ],
    },
    {
        key: 'scales-formatting',
        title: 'Scales formatting',
        blurb: 'Formatter, locale and font all come through the options object.',
        options: [
            {
                label: 'Custom price formatter',
                build: (ctx) => areaChart(ctx, {
                    chart: { localization: { priceFormatter: (value) => `$${value.toFixed(2)}` } },
                }),
            },
            {
                label: 'Custom locale',
                build: (ctx) => areaChart(ctx, { chart: { localization: { locale: 'ar' } } }),
            },
            {
                label: 'Custom font family',
                build: (ctx) => areaChart(ctx, { chart: { layout: { fontFamily: 'Georgia, serif', fontSize: 13 } } }),
            },
        ],
    },
    {
        key: 'price-scale',
        title: 'Price scale',
        blurb: 'All four scale modes, plus titled price lines.',
        options: [
            { label: 'Regular', build: (ctx) => scaleModeDemo(ctx, 0) },
            { label: 'Logarithmic', build: (ctx) => scaleModeDemo(ctx, 1) },
            { label: 'Percentage', build: (ctx) => scaleModeDemo(ctx, 2) },
            { label: 'Indexed to 100', build: (ctx) => scaleModeDemo(ctx, 3) },
            { label: 'Price line titles', build: (ctx) => priceLineTitlesDemo(ctx) },
        ],
    },
    {
        key: 'scales-config',
        title: 'Scales config',
        blurb: 'A scale on each side, and overlay scales that draw no axis at all. Series pick one by priceScaleId.',
        options: [
            { label: '1 scale', build: (ctx) => areaChart(ctx) },
            { label: '2 scales', build: (ctx) => twoScalesDemo(ctx) },
            { label: 'Overlay scale', build: (ctx) => overlayScaleDemo(ctx) },
            { label: 'Time scale hidden', build: (ctx) => areaChart(ctx, { chart: { timeScale: { visible: false } } }) },
        ],
    },
    {
        key: 'data',
        title: 'Data',
        blurb: 'Live updates, whitespace gaps, and older bars paged in as you scroll off the left edge.',
        options: [
            { label: 'Realtime updates', build: (ctx) => realtimeDemo(ctx) },
            { label: 'Whitespaces', build: (ctx) => whitespaceDemo(ctx) },
            { label: 'Infinite history', build: (ctx) => infiniteHistoryDemo(ctx) },
        ],
    },
    {
        key: 'indicators',
        title: 'Indicators & markers',
        blurb: 'Volume sits in its own pane. A moving average is a line series over numbers you computed.',
        options: [
            { label: 'Volume', build: (ctx) => volumeDemo(ctx) },
            { label: 'Series markers', build: (ctx) => markersDemo(ctx) },
            { label: 'Moving average', build: (ctx) => movingAverageDemo(ctx) },
        ],
    },
    {
        key: 'custom-chart-types',
        title: 'Custom chart types',
        blurb: 'Series drawn entirely by the caller through addCustomSeries. None of the three is a library feature.',
        badge: NOT_LIBRARY,
        options: [
            { label: 'Stacked area', build: (ctx) => stackedAreaDemo(ctx) },
            { label: 'Heatmap', build: (ctx) => heatmapDemo(ctx) },
            { label: 'HLC area', build: (ctx) => hlcAreaDemo(ctx) },
        ],
    },
    {
        key: 'custom-plugins',
        title: 'Custom plugins',
        blurb: 'All three are primitives — caller-written drawing code. Ours has taken the same object since Phase 2.',
        badge: NOT_LIBRARY,
        options: [
            { label: 'Bands indicator', build: (ctx) => bandsDemo(ctx) },
            { label: 'Partial price line', build: (ctx) => partialLineDemo(ctx) },
            { label: 'Price alerts', build: (ctx) => priceAlertsDemo(ctx) },
        ],
    },
];

/* ------------------------------------------------------------------ builders */

function simpleSeries(ctx, definition, seriesOptions) {
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light'));
    const series = chart.addSeries(ctx.lib[definition], seriesOptions);

    series.setData(ctx.points);
    chart.timeScale().fitContent();

    return { chart, series };
}

function candleDemo(ctx) {
    return simpleSeries(ctx, 'CandlestickSeries', {});
}

function scaleModeDemo(ctx, mode) {
    return areaChart(ctx, { chart: { rightPriceScale: { mode } } });
}

function priceLineTitlesDemo(ctx) {
    const { chart, series } = areaChart(ctx);
    const values = ctx.points.map(closeOf);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;

    [
        { price: high, title: 'maximum price' },
        { price: average, title: 'average price' },
        { price: low, title: 'minimum price' },
    ].forEach(({ price, title }) => series.createPriceLine({
        price,
        title,
        color: '#2962ff',
        lineWidth: 2,
        axisLabelVisible: true,
    }));

    return { chart, series };
}

function compareDemo(ctx, count) {
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light', {
        rightPriceScale: { borderVisible: false, mode: 2 },
    }));

    for (let index = 0; index < count; index++) {
        const series = chart.addSeries(ctx.lib.LineSeries, {
            color: COMPARE_COLOURS[index],
            lineWidth: 2,
            lastValueVisible: true,
        });

        series.setData(index === 0 ? ctx.points.map((point) => ({ time: point.time, value: closeOf(point) })) : relatedSeries(ctx.points, index));
    }

    chart.timeScale().fitContent();

    return { chart };
}

function realtimeButtonDemo(ctx) {
    const { chart, series } = areaChart(ctx, { chart: { handleScroll: true, handleScale: true } });

    chart.timeScale().applyOptions({ rightOffset: 40 });

    return {
        chart,
        series,
        action: { label: 'Go to realtime', run: () => chart.timeScale().scrollToRealTime() },
    };
}

function watermarkDemo(ctx) {
    const { chart, series } = areaChart(ctx, { theme: 'colorful' });

    // The library's own, not the hand-rolled primitive this demo used to
    // carry — same contract, one less thing for a caller to write.
    series.attachPrimitive(ctx.lib.createTextWatermark({
        text: 'Watermark Example',
        color: 'rgba(233, 216, 255, 0.22)',
        fontSize: 34,
    }));

    return { chart, series };
}

function legendDemo(ctx, lines) {
    const { chart, series } = areaChart(ctx);
    const last = ctx.points[ctx.points.length - 1];

    const write = (point) => {
        const value = point ? closeOf(point) : closeOf(last);

        ctx.overlay.hidden = false;
        ctx.overlay.innerHTML = lines === 1
            ? `<div>ARINCEN · ${Number(value).toFixed(2)}</div>`
            : `<div>ARINCEN</div><div>${Number(value).toFixed(2)}</div><div>${point ? formatTime(point.time) : '—'}</div>`;
    };

    write(null);
    chart.subscribeCrosshairMove((param) => write(param.seriesData?.get(series) ?? null));

    return { chart, series };
}

function tooltipDemo(ctx, tracking) {
    const { chart, series } = areaChart(ctx);

    chart.subscribeCrosshairMove((param) => {
        const point = param.seriesData?.get(series);

        if (! point || ! param.point) {
            ctx.overlay.hidden = true;

            return;
        }

        ctx.overlay.hidden = false;
        ctx.overlay.innerHTML = `<div>${Number(closeOf(point)).toFixed(2)}</div><div>${formatTime(param.time)}</div>`;

        if (tracking) {
            // The tracking variant follows the pointer; the floating one stays
            // pinned, which is the only difference between the two demos.
            ctx.overlay.style.left = `${param.point.x + 16}px`;
            ctx.overlay.style.top = `${param.point.y + 16}px`;
        }
    });

    return { chart, series };
}

function realtimeDemo(ctx) {
    const history = ctx.points.slice(0, -20);
    const queue = ctx.points.slice(-20);
    const { chart, series } = areaChart(ctx, { data: history });

    let cursor = 0;
    const timer = setInterval(() => {
        if (cursor >= queue.length) {
            cursor = 0;
            series.setData(history);

            return;
        }

        series.update(queue[cursor]);
        cursor++;
    }, 600);

    return { chart, series, cleanup: () => clearInterval(timer) };
}

function whitespaceDemo(ctx) {
    // A point carrying a time but no value is whitespace: it holds its slot on
    // the axis and breaks the line, rather than being bridged over.
    const data = ctx.points.map((point, index) => (
        index > 40 && index < 55 ? { time: point.time } : point
    ));

    return areaChart(ctx, { data });
}

function volumeDemo(ctx) {
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light'));
    const price = chart.addSeries(ctx.lib.CandlestickSeries, {}, 0);

    price.setData(ctx.points);

    if (typeof chart.panes === 'function') {
        const volume = chart.addSeries(
            ctx.lib.HistogramSeries,
            { color: '#8b95a8', priceLineVisible: false, lastValueVisible: false },
            1,
        );

        volume.setData(syntheticVolume(ctx.points));
    }

    chart.timeScale().fitContent();

    return { chart, series: price };
}

function markersDemo(ctx) {
    const { chart, series } = areaChart(ctx);
    const step = Math.max(1, Math.floor(ctx.points.length / 5));
    const markers = [1, 2, 3, 4].map((multiplier) => {
        const point = ctx.points[step * multiplier];
        const buy = multiplier % 2 === 1;

        return {
            time: point.time,
            position: buy ? 'belowBar' : 'aboveBar',
            color: buy ? '#22ab94' : '#f23645',
            shape: buy ? 'arrowUp' : 'arrowDown',
            text: buy ? 'Buy' : 'Sell',
        };
    });

    ctx.lib.createSeriesMarkers(series, markers);

    return { chart, series };
}

function movingAverageDemo(ctx) {
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light'));
    const candles = chart.addSeries(ctx.lib.CandlestickSeries, {});

    candles.setData(ctx.points);

    const average = chart.addSeries(ctx.lib.LineSeries, {
        color: '#2962ff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    average.setData(movingAverage(ctx.points, 14));
    chart.timeScale().fitContent();

    return { chart, series: candles };
}

function bandsDemo(ctx) {
    const { chart, series } = areaChart(ctx, {}, {
        lineColor: '#111827',
        topColor: 'rgba(17, 24, 39, 0.10)',
        bottomColor: 'rgba(17, 24, 39, 0)',
    });

    series.attachPrimitive(bandsPrimitive(series, volatilityBand(ctx.points, 20, 2), {
        fill: 'rgba(41, 98, 255, 0.14)',
        edge: 'rgba(41, 98, 255, 0.85)',
        middle: 'rgba(41, 98, 255, 0.55)',
    }));

    return { chart, series };
}

function partialLineDemo(ctx) {
    const { chart, series } = areaChart(ctx, {}, { priceLineVisible: false, lastValueVisible: false });
    const last = ctx.points[ctx.points.length - 1];

    // Whitespace to the right of the last bar, so the line has somewhere to run
    // to — with the data fitted exactly to the width there is nothing to see.
    chart.timeScale().applyOptions({ rightOffset: 14 });
    series.attachPrimitive(partialPriceLinePrimitive(series, last.time, closeOf(last), '#2962ff'));

    return { chart, series };
}

function priceAlertsDemo(ctx) {
    const { chart, series } = areaChart(ctx);
    const values = ctx.points.map(closeOf);
    const high = Math.max(...values);
    const low = Math.min(...values);

    series.createPriceLine({
        price: low + (high - low) * 0.75,
        title: 'alert',
        color: '#f23645',
        lineWidth: 1,
        lineStyle: 2,
    });
    series.createPriceLine({
        price: low + (high - low) * 0.25,
        title: 'alert',
        color: '#22ab94',
        lineWidth: 1,
        lineStyle: 2,
    });

    return { chart, series };
}

function customChart(ctx, view, data) {
    // A free crosshair, not a magnetised one. Magnet snaps to a series' closing
    // value, and a stack of five layers or a grid of depth cells has no single
    // price to snap to — the reading that matters is wherever the pointer is.
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light', {
        crosshair: { mode: 0 },
    }));

    if (typeof chart.addCustomSeries !== 'function') {
        return { chart };
    }

    const series = chart.addCustomSeries(view, {});

    series.setData(data);
    chart.timeScale().fitContent();

    return { chart, series };
}

/**
 * Layers that actually go somewhere. Sized off the instrument's own price so
 * the stack moves with the data, but each given its own trend and cycle —
 * bands of near-constant thickness read as a striped blanket rather than as a
 * chart, however well they are drawn.
 */
function stackedAreaDemo(ctx) {
    const span = Math.max(1, ctx.points.length - 1);
    const data = ctx.points.map((point, index) => {
        const progress = index / span;
        const close = closeOf(point);

        return {
            time: point.time,
            values: [
                close * (0.10 + 0.16 * progress),
                close * (0.26 - 0.18 * progress),
                close * (0.08 + 0.14 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 2))),
                close * (0.05 + 0.20 * progress * progress),
                close * (0.22 - 0.14 * Math.abs(Math.sin(progress * Math.PI))),
            ],
        };
    });

    return customChart(ctx, stackedAreaView(), data);
}

function hlcAreaDemo(ctx) {
    const data = ctx.points.map((point) => ({
        time: point.time,
        high: point.high ?? closeOf(point),
        low: point.low ?? closeOf(point),
        close: closeOf(point),
    }));

    return customChart(ctx, hlcAreaView(), data);
}

/**
 * Depth around the traded price: cells nearest the close carry the most, and
 * the concentration wanders over time so the picture has structure rather than
 * uniform noise.
 */
function heatmapDemo(ctx) {
    const values = ctx.points.map(closeOf);
    const floor = Math.min(...values) * 0.97;
    const ceiling = Math.max(...values) * 1.03;
    const rows = 14;
    const step = (ceiling - floor) / rows;

    const data = ctx.points.map((point, index) => {
        const close = closeOf(point);
        const focus = close + Math.sin(index / 14) * step * 2;
        const cells = Array.from({ length: rows }, (_, row) => {
            const low = floor + row * step;
            const distance = Math.abs(low + step / 2 - focus) / (step * 4);
            const amount = Math.exp(-distance * distance) * (0.65 + 0.35 * Math.abs(Math.sin(index / 5 + row)));

            return { low, high: low + step, amount };
        });

        return { time: point.time, cells };
    });

    return customChart(ctx, heatmapView(), data);
}

/**
 * Two instruments on one chart at genuinely different magnitudes — the case a
 * second axis exists for. On one scale the smaller of them would be a flat line
 * along the bottom.
 */
function twoScalesDemo(ctx) {
    // Interaction left on for this one: each axis scales only its own series,
    // and that is not a claim a still picture can carry.
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light', {
        handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: false },
        handleScroll: false,
    }));
    const right = chart.addSeries(ctx.lib.LineSeries, { color: '#2962ff', lineWidth: 2 });

    right.setData(ctx.points.map((point) => ({ time: point.time, value: closeOf(point) })));

    const left = chart.addSeries(ctx.lib.LineSeries, {
        color: '#e5395f',
        lineWidth: 2,
        priceScaleId: 'left',
    });

    left.setData(ctx.points.map((point, index) => ({
        time: point.time,
        value: closeOf(point) * 40 * (1 + Math.sin(index / 21) * 0.12),
    })));

    chart.timeScale().fitContent();

    return { chart, series: right };
}

/**
 * An overlay scales its own series and draws no axis — how a volume histogram
 * sits under a price chart without a second gutter or a second pane.
 */
function overlayScaleDemo(ctx) {
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light'));
    const volume = chart.addSeries(ctx.lib.HistogramSeries, {
        color: 'rgba(41, 98, 255, 0.35)',
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
    });

    volume.setData(syntheticVolume(ctx.points));
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

    const price = chart.addSeries(ctx.lib.AreaSeries, {
        lineColor: '#111827',
        topColor: 'rgba(17, 24, 39, 0.12)',
        bottomColor: 'rgba(17, 24, 39, 0)',
        lineWidth: 2,
    });

    price.setData(ctx.points);
    chart.timeScale().fitContent();

    return { chart, series: price };
}

/**
 * Older bars fetched as the viewport runs off the left edge — the pattern
 * `subscribeVisibleLogicalRangeChange` exists for. A real one would go to the
 * network here; this synthesises a further year each time.
 */
function infiniteHistoryDemo(ctx) {
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light', {
        handleScroll: { horzTouchDrag: true, pressedMouseMove: true, mouseWheel: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false },
    }));
    const series = chart.addSeries(ctx.lib.AreaSeries, {
        lineColor: '#2962ff',
        topColor: 'rgba(41, 98, 255, 0.28)',
        bottomColor: 'rgba(41, 98, 255, 0)',
        lineWidth: 2,
    });

    let loaded = ctx.points.slice(-90);
    let loading = false;

    series.setData(loaded);
    chart.timeScale().fitContent();

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (! range || loading || range.from > 10) {
            return;
        }

        loading = true;

        const step = (loaded[1]?.time ?? 0) - (loaded[0]?.time ?? 0) || 86400;
        const first = loaded[0];
        const older = Array.from({ length: 60 }, (_, index) => {
            const back = 60 - index;

            return {
                time: first.time - back * step,
                value: closeOf(first) * (1 - Math.sin(back / 13) * 0.06 - back * 0.0008),
            };
        });

        loaded = [...older, ...loaded];
        series.setData(loaded);
        loading = false;
    });

    return { chart, series };
}

/**
 * A tooltip that magnifies the reading it is showing. On a touch screen the
 * crosshair is offset above the finger, which is what `trackingMode` is for —
 * a reading you are covering with your hand is no reading at all.
 */
function magnifierDemo(ctx) {
    const { chart, series } = areaChart(ctx);

    chart.subscribeCrosshairMove((param) => {
        const point = param.seriesData?.get(series);

        if (! point || ! param.point) {
            ctx.overlay.hidden = true;

            return;
        }

        ctx.overlay.hidden = false;
        ctx.overlay.innerHTML = `<div style="font-size:20px;font-weight:700">${Number(closeOf(point)).toFixed(2)}</div>`
            + `<div>${formatTime(param.time)}</div>`;
        ctx.overlay.style.left = `${param.point.x + 20}px`;
        ctx.overlay.style.top = `${param.point.y - 10}px`;
    });

    return { chart, series };
}

function baselineDemo(ctx) {
    const values = ctx.points.map(closeOf);
    const chart = ctx.lib.createChart(ctx.container, chartOptions('light'));
    const series = chart.addSeries(ctx.lib.BaselineSeries, {
        baseValue: { type: 'price', price: values.reduce((sum, value) => sum + value, 0) / values.length },
    });

    series.setData(ctx.points);
    chart.timeScale().fitContent();

    return { chart, series };
}

function formatTime(time) {
    if (typeof time === 'number') {
        return new Date(time * 1000).toISOString().slice(0, 10);
    }

    return String(time ?? '—');
}
