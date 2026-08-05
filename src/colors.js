const HEX_SHORT = /^#([\da-f])([\da-f])([\da-f])$/i;
const HEX_LONG = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i;
const RGB_FUNC = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i;

/**
 * @param {string} color
 * @return {{r: number, g: number, b: number, a: number}|null}
 */
export function parseColor(color) {
    if (typeof color !== 'string') {
        return null;
    }

    const value = color.trim();
    const short = HEX_SHORT.exec(value);

    if (short) {
        return {
            r: parseInt(short[1] + short[1], 16),
            g: parseInt(short[2] + short[2], 16),
            b: parseInt(short[3] + short[3], 16),
            a: 1,
        };
    }

    const long = HEX_LONG.exec(value);

    if (long) {
        return {
            r: parseInt(long[1], 16),
            g: parseInt(long[2], 16),
            b: parseInt(long[3], 16),
            a: long[4] === undefined ? 1 : parseInt(long[4], 16) / 255,
        };
    }

    const func = RGB_FUNC.exec(value);

    if (func) {
        return {
            r: Number(func[1]),
            g: Number(func[2]),
            b: Number(func[3]),
            a: func[4] === undefined ? 1 : Number(func[4]),
        };
    }

    return null;
}

/**
 * Readable text colour for a filled badge — used for the last-value and
 * crosshair labels, whose background is whatever colour the caller picked.
 *
 * @param {string} background
 * @return {string}
 */
export function contrastTextColor(background) {
    const parsed = parseColor(background);

    if (! parsed) {
        return '#ffffff';
    }

    const luminance = (0.299 * parsed.r + 0.587 * parsed.g + 0.114 * parsed.b) / 255;

    return luminance > 0.6 ? '#000000' : '#ffffff';
}

/**
 * @param {string} color
 * @param {number} alpha
 * @return {string}
 */
export function withAlpha(color, alpha) {
    const parsed = parseColor(color);

    if (! parsed) {
        return color;
    }

    return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}
