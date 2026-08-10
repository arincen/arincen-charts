const MS_THRESHOLD = 1e12;
const BUSINESS_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

export const TickWeight = {
    Minute: 1,
    Hour: 2,
    Day: 3,
    Month: 4,
    Year: 5,
};

/**
 * Normalises every time form the chart accepts into UTC seconds.
 *
 * Accepts a UNIX timestamp (seconds or milliseconds), a `YYYY-MM-DD`
 * business day, a `YYYY-MM-DD HH:mm:ss` string, or a `{year, month, day}`
 * object — the same vocabulary the site's chart payloads already use.
 *
 * @param {number|string|{year: number, month: number, day: number}} time
 * @return {number|null}
 */
export function toTimestamp(time) {
    if (time === null || time === undefined) {
        return null;
    }

    if (typeof time === 'number') {
        if (! Number.isFinite(time)) {
            return null;
        }

        return time >= MS_THRESHOLD ? Math.floor(time / 1000) : Math.floor(time);
    }

    if (typeof time === 'string') {
        const businessDay = BUSINESS_DAY_RE.exec(time);

        if (businessDay) {
            return Date.UTC(+businessDay[1], +businessDay[2] - 1, +businessDay[3]) / 1000;
        }

        const dateTime = DATE_TIME_RE.exec(time);

        if (dateTime) {
            return Date.UTC(
                +dateTime[1],
                +dateTime[2] - 1,
                +dateTime[3],
                +dateTime[4],
                +dateTime[5],
                dateTime[6] ? +dateTime[6] : 0,
            ) / 1000;
        }

        const parsed = Date.parse(time);

        return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
    }

    if (typeof time === 'object' && time.year !== undefined) {
        return Date.UTC(time.year, (time.month ?? 1) - 1, time.day ?? 1) / 1000;
    }

    return null;
}

/**
 * @param {number} timestamp
 * @return {{year: number, month: number, day: number, hour: number, minute: number}}
 */
export function utcParts(timestamp) {
    const date = new Date(timestamp * 1000);

    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
    };
}

/**
 * How significant a boundary this timestamp crosses compared with the one
 * before it. Axis ticks are then chosen highest-weight-first, which is what
 * puts the year label on the January bar rather than on an arbitrary bar.
 *
 * @param {number} timestamp
 * @param {number|null} previous
 * @return {number}
 */
export function tickWeight(timestamp, previous) {
    if (previous === null || previous === undefined) {
        return TickWeight.Year;
    }

    const current = utcParts(timestamp);
    const before = utcParts(previous);

    if (current.year !== before.year) {
        return TickWeight.Year;
    }

    if (current.month !== before.month) {
        return TickWeight.Month;
    }

    if (current.day !== before.day) {
        return TickWeight.Day;
    }

    if (current.hour !== before.hour) {
        return TickWeight.Hour;
    }

    return TickWeight.Minute;
}

const formatterCache = new Map();

function intlFormatter(locale, options) {
    const key = locale + '|' + JSON.stringify(options);
    let formatter = formatterCache.get(key);

    if (! formatter) {
        formatter = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
        formatterCache.set(key, formatter);
    }

    return formatter;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

/**
 * Fills a caller's date pattern.
 *
 * The vocabulary is the one anybody arriving from another charting library
 * already has in their fingers — `yyyy`, `MM`, `dd` and the rest. Longest
 * tokens are replaced first, or `yyyy` would be eaten twice by `yy`.
 *
 * @param {string} pattern
 * @param {number} timestamp
 * @param {string} locale
 * @return {string}
 */
export function formatDatePattern(pattern, timestamp, locale) {
    const parts = utcParts(timestamp);
    const month = (options) => intlFormatter(locale, options).format(timestamp * 1000);

    const tokens = {
        yyyy: String(parts.year),
        yy: String(parts.year).slice(-2),
        MMMM: month({ month: 'long' }),
        MMM: month({ month: 'short' }),
        MM: pad(parts.month + 1),
        dd: pad(parts.day),
        d: String(parts.day),
        HH: pad(parts.hour),
        mm: pad(parts.minute),
    };

    return pattern.replace(/yyyy|yy|MMMM|MMM|MM|dd|d|HH|mm/g, (token) => tokens[token]);
}

/**
 * @param {number} timestamp
 * @param {number} weight
 * @param {{locale: string, spanSeconds: number, dateFormat: (string|null)}} context
 * @return {string}
 */
export function formatTick(timestamp, weight, context) {
    const { locale, spanSeconds, dateFormat } = context;
    const parts = utcParts(timestamp);

    // A pattern replaces the whole ladder, deliberately: a caller who has said
    // exactly how a date should read does not want a different answer at every
    // zoom level, which is the ladder's entire purpose.
    if (dateFormat && weight >= TickWeight.Day) {
        return formatDatePattern(dateFormat, timestamp, locale);
    }

    if (weight >= TickWeight.Year) {
        return String(parts.year);
    }

    if (weight === TickWeight.Month) {
        return intlFormatter(locale, { month: 'short' }).format(timestamp * 1000);
    }

    if (weight === TickWeight.Day) {
        return spanSeconds > 400 * 86400
            ? intlFormatter(locale, { day: 'numeric', month: 'short' }).format(timestamp * 1000)
            : String(parts.day);
    }

    return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Label shown on the time axis under the crosshair.
 *
 * @param {number} timestamp
 * @param {{locale: string, intraday: boolean}} context
 * @return {string}
 */
export function formatCrosshairTime(timestamp, context) {
    const { locale, intraday } = context;

    if (intraday) {
        return intlFormatter(locale, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(timestamp * 1000);
    }

    return intlFormatter(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(timestamp * 1000);
}
