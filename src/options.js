export const LineStyle = {
    Solid: 0,
    Dotted: 1,
    Dashed: 2,
    LargeDashed: 3,
    SparseDotted: 4,
};

export const LineType = {
    /** Straight segments between points. */
    Simple: 0,
    /**
     * A staircase: the value holds until the next point, then jumps.
     *
     * The honest shape for anything that changes at moments rather than
     * continuously — a policy rate, a dividend per share, a position size.
     * Drawing those as diagonals says the value glided between the readings,
     * which is not what happened.
     */
    WithSteps: 1,
    /** A smooth curve through the points. */
    Curved: 2,
};

export const LastPriceAnimationMode = {
    Disabled: 0,
    /** Always pulsing, so a live price is visibly live. */
    Continuous: 1,
    /** Pulses once each time the value changes. */
    OnDataUpdate: 2,
};

export const PriceLineSource = {
    /** The last bar in the data, whether or not it is on screen. */
    LastBar: 0,
    /** The last bar currently in view, so the line follows a scroll back. */
    LastVisible: 1,
};

export const CrosshairMode = {
    /** Follows the pointer exactly; the price it reports is wherever you are. */
    Normal: 0,
    /** Sticks to the closing value of whichever series is nearest. */
    Magnet: 1,
    Hidden: 2,
    /** Sticks to the nearest of open, high, low or close. */
    MagnetOHLC: 3,
};

export const PriceScaleMode = {
    Normal: 0,
    Logarithmic: 1,
    /** Restated as a move from the first visible value, in per cent. */
    Percentage: 2,
    /** The same move, restated as an index where the first value is 100. */
    IndexedTo100: 3,
};

/**
 * Defaults for the left-hand price scale. A free function rather than a field
 * on `chartDefaults`, so the light build — which only ever has a right-hand
 * scale — never carries them.
 *
 * @return {Object}
 */
export function leftScaleDefaults() {
    return {
        visible: true,
        autoScale: true,
        mode: PriceScaleMode.Normal,
        borderVisible: true,
        borderColor: '#e5e5e5',
        scaleMargins: { top: 0.16, bottom: 0.12 },
        minimumWidth: 0,
        ticksVisible: false,
        alignLabels: true,
        entireTextOnly: false,
        invertScale: false,
    };
}

export function chartDefaults() {
    return {
        width: 0,
        height: 0,
        autoSize: false,
        layout: {
            background: { type: 'solid', color: '#ffffff' },
            textColor: '#0a0a0a',
            fontSize: 12,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            attributionLogo: true,

            // Passed to the canvas. `display-p3` on a screen that has the
            // gamut renders colours a plugin author picked in a wide-gamut
            // tool as they picked them, instead of flattened into sRGB.
            colorSpace: 'srgb',
        },
        // A palette laid under everything else: 'light', 'dark', or 'auto' to
        // follow the reader's system. Null leaves the built-in light values,
        // which is what a caller who has never heard of this option gets.
        theme: null,

        // Set while a request is in flight, so the chart says so rather than
        // showing an empty one. The caller's to set: only they know.
        loading: false,

        localization: {
            locale: 'en',

            // Shown in the middle of an otherwise empty chart. Set either to
            // null to draw nothing at all.
            emptyText: 'No data',
            loadingText: 'Loading…',
            priceFormatter: null,
            timeFormatter: null,

            // A pattern in the vocabulary a caller expects — yyyy, MM, dd and
            // friends — for the dates on the axis and in the crosshair badge.
            dateFormat: null,

            // Percentage and indexed axes print through this when it is set,
            // so a caller can decide how many decimals a move deserves.
            percentageFormatter: null,
        },
        grid: {
            vertLines: { visible: true, color: '#e5e5e5', style: LineStyle.Dotted },
            horzLines: { visible: true, color: '#e5e5e5', style: LineStyle.Dotted },
        },
        crosshair: {
            mode: CrosshairMode.Magnet,
            vertLine: {
                visible: true,
                color: '#737373',
                width: 1,
                style: LineStyle.Dotted,
                labelVisible: true,
                labelBackgroundColor: '#0a0a0a',
            },
            horzLine: {
                visible: true,
                color: '#737373',
                width: 1,
                style: LineStyle.Dotted,
                labelVisible: true,
                labelBackgroundColor: '#0a0a0a',
            },

            // Ours defaults the other way round from theirs, deliberately.
            // Their crosshair snaps to the data points of hidden series unless
            // told not to, and a crosshair sticking to a reading nobody can see
            // is a magnet pulling towards nothing. The option exists so a
            // caller who wants their behaviour can ask for it.
            doNotSnapToHiddenSeriesIndices: true,

            // Bring the series under the pointer forward by fading the others.
            // On by default: a chart carrying four lines is asking the reader
            // to follow one of them, and nothing else on it says which.
            dimOtherSeries: true,
        },
        rightPriceScale: {
            visible: true,
            autoScale: true,
            // Modes beyond Normal exist only in the full build.
            mode: PriceScaleMode.Normal,
            borderVisible: true,
            borderColor: '#e5e5e5',
            scaleMargins: { top: 0.16, bottom: 0.12 },
            minimumWidth: 0,

            // A small mark joining each label to the axis line.
            ticksVisible: false,

            // Nudge overlapping badges apart rather than letting them stack
            // into an unreadable pile.
            alignLabels: true,

            // Drop a corner label rather than clip it. A half-shown price is
            // read as a whole one, which is worse than no label at all.
            entireTextOnly: false,

            // Upside down, so a falling market reads as a rising line. A
            // convention some desks work in, and the only way to see a spread
            // the way the other side of it does.
            invertScale: false,
        },
        timeScale: {
            visible: true,
            borderVisible: true,
            borderColor: '#e5e5e5',
            timeVisible: false,
            secondsVisible: false,
            fixLeftEdge: false,
            fixRightEdge: false,
            rightOffset: 0,
            barSpacing: 8,

            // Follow new bars only while the newest one is on screen. A reader
            // who has scrolled back into history did not ask to be dragged
            // forward every time a tick arrives.
            shiftVisibleRangeOnNewBar: true,
            minBarSpacing: 0.4,

            // Zero means no ceiling, matching the convention a caller will
            // already have met: an option that clamps is off when it is nought,
            // not when it is absent.
            maxBarSpacing: 0,

            // Given the timestamp, the weight of the boundary it crosses and
            // the locale, and expected to return a string — or nothing, to let
            // the built-in formatting answer.
            tickMarkFormatter: null,

            // A small mark joining each label to the axis line.
            ticksVisible: false,

            // Let the coarsest boundary on screen be set in bold.
            allowBoldLabels: true,

            // Hold the framing through a resize rather than keeping the bar
            // width. A dashboard that reflows panels wants the same span of
            // time in a narrower box, not the same bars with fewer of them.
            lockVisibleTimeRangeOnResize: false,

            // Keep the bar under the pointer under the pointer while the wheel
            // zooms, instead of anchoring the zoom to the right edge.
            rightBarStaysOnScroll: false,
        },
        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
        },
        handleScale: {
            mouseWheel: true,
            pinch: true,
            axisPressedMouseMove: true,

            // Double-clicking an axis hands it back to automatic scaling.
            axisDoubleClickReset: true,
        },
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && ! Array.isArray(value);
}

/**
 * Merges partial options into a target the way the chart API expects:
 * nested objects are merged, everything else replaces. `handleScroll: false`
 * is expanded to every sub-flag, matching the shorthand the widgets use.
 *
 * @param {Object} target
 * @param {Object} source
 * @return {Object}
 */
/**
 * Languages written right to left.
 *
 * Matched on the language subtag alone, so `ar-SA` and `ar` are the same
 * answer. The list is short and closed: these are the scripts in use, not a
 * guess at what a tag might mean.
 */
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku'];

/**
 * Whether a locale reads right to left.
 *
 * @param {string} locale
 * @return {boolean}
 */
export function isRightToLeft(locale) {
    return RTL_LANGUAGES.includes(String(locale ?? '').toLowerCase().split(/[-_]/)[0]);
}

export function mergeOptions(target, source) {
    if (! isPlainObject(source)) {
        return target;
    }

    for (const key of Object.keys(source)) {
        const value = source[key];

        if (typeof value === 'boolean' && isPlainObject(target[key])) {
            for (const nested of Object.keys(target[key])) {
                if (typeof target[key][nested] === 'boolean') {
                    target[key][nested] = value;
                }
            }

            continue;
        }

        if (isPlainObject(value) && isPlainObject(target[key])) {
            mergeOptions(target[key], value);

            continue;
        }

        target[key] = isPlainObject(value) ? mergeOptions({}, value) : value;
    }

    return target;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} style
 * @param {number} width
 */
export function applyLineStyle(ctx, style, width) {
    switch (style) {
        case LineStyle.Dotted:
            ctx.setLineDash([width, width]);
            break;
        case LineStyle.Dashed:
            ctx.setLineDash([3 * width, 3 * width]);
            break;
        case LineStyle.LargeDashed:
            ctx.setLineDash([8 * width, 5 * width]);
            break;
        case LineStyle.SparseDotted:
            ctx.setLineDash([width, 5 * width]);
            break;
        default:
            ctx.setLineDash([]);
    }
}
