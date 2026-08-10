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
        borderColor: '#d6dcde',
        scaleMargins: { top: 0.2, bottom: 0.1 },
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
            textColor: '#191919',
            fontSize: 12,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            attributionLogo: true,

            // Passed to the canvas. `display-p3` on a screen that has the
            // gamut renders colours a plugin author picked in a wide-gamut
            // tool as they picked them, instead of flattened into sRGB.
            colorSpace: 'srgb',
        },
        localization: {
            locale: 'en',
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
            vertLines: { visible: true, color: '#e6e6e6', style: LineStyle.Solid },
            horzLines: { visible: true, color: '#e6e6e6', style: LineStyle.Solid },
        },
        crosshair: {
            mode: CrosshairMode.Magnet,
            vertLine: {
                visible: true,
                color: '#9598a1',
                width: 1,
                style: LineStyle.LargeDashed,
                labelVisible: true,
                labelBackgroundColor: '#131722',
            },
            horzLine: {
                visible: true,
                color: '#9598a1',
                width: 1,
                style: LineStyle.LargeDashed,
                labelVisible: true,
                labelBackgroundColor: '#131722',
            },

            // Ours defaults the other way round from theirs, deliberately.
            // Their crosshair snaps to the data points of hidden series unless
            // told not to, and a crosshair sticking to a reading nobody can see
            // is a magnet pulling towards nothing. The option exists so a
            // caller who wants their behaviour can ask for it.
            doNotSnapToHiddenSeriesIndices: true,
        },
        rightPriceScale: {
            visible: true,
            autoScale: true,
            // Modes beyond Normal exist only in the full build.
            mode: PriceScaleMode.Normal,
            borderVisible: true,
            borderColor: '#d6dcde',
            scaleMargins: { top: 0.2, bottom: 0.1 },
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
            borderColor: '#d6dcde',
            timeVisible: false,
            secondsVisible: false,
            fixLeftEdge: false,
            fixRightEdge: false,
            rightOffset: 0,
            barSpacing: 6,

            // Follow new bars only while the newest one is on screen. A reader
            // who has scrolled back into history did not ask to be dragged
            // forward every time a tick arrives.
            shiftVisibleRangeOnNewBar: true,
            minBarSpacing: 0.5,

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
            ctx.setLineDash([4 * width, 2 * width]);
            break;
        case LineStyle.LargeDashed:
            ctx.setLineDash([6 * width, 6 * width]);
            break;
        case LineStyle.SparseDotted:
            ctx.setLineDash([width, 4 * width]);
            break;
        default:
            ctx.setLineDash([]);
    }
}
