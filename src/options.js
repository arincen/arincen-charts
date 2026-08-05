export const LineStyle = {
    Solid: 0,
    Dotted: 1,
    Dashed: 2,
    LargeDashed: 3,
    SparseDotted: 4,
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
        },
        localization: {
            locale: 'en',
            priceFormatter: null,
            timeFormatter: null,
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
            minBarSpacing: 0.5,
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
