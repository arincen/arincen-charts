import { FULL_BUILD } from './flags.js';
import { PriceScaleMode } from './options.js';

/**
 * Index-based horizontal scale.
 *
 * Bars are laid out at even spacing by their position in the merged time
 * index, never by elapsed time — that is what collapses weekends, holidays
 * and overnight gaps instead of drawing empty space for them.
 */
export class TimeScale {
    constructor(options) {
        this.options = options;
        this.points = [];
        this.barSpacing = options.barSpacing;
        this.rightOffset = options.rightOffset;
        this.width = 0;
        this.padBars = 0;
    }

    /**
     * @param {number[]} timestamps ascending, unique
     */
    setPoints(timestamps) {
        this.points = timestamps;
    }

    get lastIndex() {
        return this.points.length - 1;
    }

    indexToX(index) {
        return this.width - (this.lastIndex + this.rightOffset - index) * this.barSpacing;
    }

    xToIndex(x) {
        return this.lastIndex + this.rightOffset - (this.width - x) / this.barSpacing;
    }

    fitContent() {
        const count = this.points.length;

        if (count === 0 || this.width <= 0) {
            return;
        }

        if (count === 1) {
            this.barSpacing = this.width;
            this.rightOffset = 0.5;

            return;
        }

        const totalBars = this.padBars > 0 ? count - 1 + this.padBars * 2 : count - 1;

        this.barSpacing = this.width / totalBars;
        this.rightOffset = this.padBars;
    }

    /**
     * The viewport in logical index space, unclamped — it runs past either end
     * of the data once the chart is zoomed or scrolled into whitespace.
     *
     * @return {{from: number, to: number}}
     */
    logicalRange() {
        return { from: this.xToIndex(0), to: this.xToIndex(this.width) };
    }

    /**
     * @return {{from: number, to: number}} inclusive data indices touching the viewport
     */
    visibleIndices() {
        if (! this.points.length) {
            return { from: 0, to: -1 };
        }

        const from = Math.max(0, Math.floor(this.xToIndex(0)));
        const to = Math.min(this.lastIndex, Math.ceil(this.xToIndex(this.width)));

        return { from, to };
    }

    /**
     * Content follows the cursor: dragging right walks back in time. Raising
     * `rightOffset` pushes the last bar further right, which slides the
     * viewport forward, so the delta is subtracted.
     *
     * @param {number} deltaPixels
     */
    scrollBy(deltaPixels) {
        this.rightOffset -= deltaPixels / this.barSpacing;
        this.clampToEdges();
    }

    zoomAt(focalX, factor) {
        const focalIndex = this.xToIndex(focalX);
        const nextSpacing = this.clampSpacing(this.barSpacing * factor);

        if (nextSpacing === this.barSpacing) {
            return;
        }

        this.barSpacing = nextSpacing;
        this.rightOffset = focalIndex - this.lastIndex + (this.width - focalX) / nextSpacing;
        this.clampToEdges();
    }

    /**
     * Sets bar spacing while holding the right edge in place — the anchor the
     * time axis uses when it is dragged.
     *
     * @param {number} spacing
     */
    setBarSpacing(spacing) {
        this.barSpacing = this.clampSpacing(spacing);
        this.clampToEdges();
    }

    clampSpacing(spacing) {
        return Math.min(Math.max(spacing, this.options.minBarSpacing), 200);
    }

    /**
     * Keeps whitespace off whichever edge the caller pinned.
     *
     * The right edge is held by capping `rightOffset`; the left edge needs the
     * opposite bound, derived from how many bars currently fit on screen.
     */
    clampToEdges() {
        if (this.barSpacing <= 0) {
            return;
        }

        if (this.options.fixRightEdge) {
            this.rightOffset = Math.min(this.rightOffset, this.padBars);
        }

        if (this.options.fixLeftEdge) {
            const visibleBars = this.width / this.barSpacing;

            this.rightOffset = Math.max(this.rightOffset, visibleBars - this.lastIndex - this.padBars);
        }
    }
}

const STEP_MULTIPLIERS = [1, 2, 2.5, 5, 10];
const MIN_TICK_SPACING = 30;
const DEFAULT_PRECISION = 2;
// Log scale is undefined at or below zero; clamp to a floor instead of NaN.
const MIN_LOG_PRICE = 1e-8;

/**
 * Full-build price-scale maths.
 *
 * These are module-level functions, not methods, and that is deliberate: a
 * class method is never dropped by a minifier — it cannot prove nothing calls
 * it dynamically — so a flagged method body would ship in the light bundle
 * anyway. As free functions, removing the only call sites makes them
 * unreferenced, and unreferenced is what a bundler can delete.
 */
function logRatio(price, min, max) {
    const low = Math.log10(Math.max(min, MIN_LOG_PRICE));
    const high = Math.log10(Math.max(max, MIN_LOG_PRICE * 10));

    return (Math.log10(Math.max(price, MIN_LOG_PRICE)) - low) / (high - low);
}

function logPrice(ratio, min, max) {
    const low = Math.log10(Math.max(min, MIN_LOG_PRICE));
    const high = Math.log10(Math.max(max, MIN_LOG_PRICE * 10));

    return Math.pow(10, low + ratio * (high - low));
}

function percentageRatio(price, min, max, base) {
    const anchor = base || min || 1;
    const at = (v) => v / anchor - 1;

    return (at(price) - at(min)) / (at(max) - at(min));
}

/**
 * Nearest rung of the nice-number ladder, rather than the next one up.
 *
 * Rounding up is right for a linear axis, where one step serves the whole
 * range. On a log axis it flattens the result: a 0.55 gap becomes a 1.0 step at
 * every height, and the growth that makes the axis readable as logarithmic
 * disappears. Nearest lets the bottom of the axis take a finer step than the
 * top.
 */
function nearestNiceStep(rawStep) {
    if (rawStep <= 0) {
        return 1;
    }

    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    let best = magnitude;

    for (const multiplier of [1, 2, 2.5, 5, 10]) {
        const candidate = multiplier * magnitude;

        if (Math.abs(candidate - rawStep) < Math.abs(best - rawStep)) {
            best = candidate;
        }
    }

    return best;
}

/**
 * Ticks for a logarithmic axis.
 *
 * Walks up the axis in even *pixel* steps and snaps each landing to a round
 * number, so the step between labels grows as prices climb — 22.80, 23.30,
 * 23.80, 24.40, 25.00, then 26, 27, 28, 29.
 *
 * Choosing round values first instead, and letting the mapping place them,
 * gives a correct axis that reads as linear: over a narrow range those labels
 * land at near-equal gaps and nothing about the picture says logarithmic. The
 * log has to be visible in the numbers, not just in the geometry.
 */
function logarithmicTicks(scale, lowPrice, highPrice) {
    const ticks = [];
    const seen = new Set();
    let price = Math.max(lowPrice, MIN_LOG_PRICE);

    for (let guard = 0; guard < 60 && price <= highPrice; guard++) {
        const oneGapUp = scale.yToPrice(scale.priceToY(price) - MIN_TICK_SPACING);
        const step = nearestNiceStep(Math.max(oneGapUp - price, price * 1e-6));
        const snapped = Number((Math.ceil(price / step + 1e-9) * step).toFixed(10));

        if (! Number.isFinite(snapped) || snapped <= price) {
            break;
        }

        if (snapped <= highPrice && ! seen.has(snapped)) {
            seen.add(snapped);
            ticks.push({ price: snapped, y: scale.priceToY(snapped) });
        }

        price = snapped;
    }

    scale.tickStep = ticks.length > 1 ? Math.abs(ticks[1].price - ticks[0].price) : 1;

    return ticks;
}

/**
 * Percentage-mode ticks.
 *
 * The axis reads in percent moved from a base — the first visible value — so
 * the round numbers have to be chosen in percent and mapped back to prices,
 * not the other way round. Stepping in price and labelling the result would
 * give an axis of 3.7%, 8.1%, 12.5%.
 */
function percentageTicks(scale, lowPrice, highPrice, height) {
    const base = scale.percentageBase || scale.min || 1;
    const toPercent = (price) => (price / base - 1) * 100;
    const lowPct = toPercent(lowPrice);
    const highPct = toPercent(highPrice);
    const target = Math.max(2, Math.min(12, Math.round(height / MIN_TICK_SPACING)));
    const step = scale.niceStep((highPct - lowPct) / target);
    const ticks = [];

    for (let pct = Math.ceil(lowPct / step) * step; pct <= highPct; pct += step) {
        const rounded = Math.abs(pct) < step / 1e6 ? 0 : pct;
        const price = base * (1 + rounded / 100);

        ticks.push({ price, y: scale.priceToY(price) });
    }

    scale.tickStep = step;

    return ticks;
}

/**
 * Vertical scale. Owns the autoscaled price range plus the `scaleMargins`
 * breathing room that keeps a series off the top and bottom edges.
 */
export class PriceScale {
    constructor(options) {
        this.options = options;
        this.min = 0;
        this.max = 1;
        this.top = 0;
        this.bottom = 0;
    }

    setRange(min, max) {
        if (! Number.isFinite(min) || ! Number.isFinite(max)) {
            this.min = 0;
            this.max = 1;

            return;
        }

        if (min === max) {
            const padding = Math.abs(min) * 0.05 || 0.5;

            this.min = min - padding;
            this.max = max + padding;

            return;
        }

        this.min = min;
        this.max = max;
    }

    setViewport(top, bottom) {
        this.top = top;
        this.bottom = bottom;
    }

    get innerTop() {
        return this.top + (this.bottom - this.top) * this.options.scaleMargins.top;
    }

    get innerBottom() {
        return this.bottom - (this.bottom - this.top) * this.options.scaleMargins.bottom;
    }

    /**
     * Where the scale sits between its bounds, 0 at the low and 1 at the high.
     *
     * Linear in the light build. The logarithmic and percentage modes are
     * compiled out of it entirely — they live in the hot path, called once per
     * point per frame, so they cannot be an opt-in module.
     */
    ratioFor(price) {
        if (FULL_BUILD) {
            if (this.options.mode === PriceScaleMode.Logarithmic) {
                return logRatio(price, this.min, this.max);
            }

            // Indexed-to-100 is the same affine restatement as percentage —
            // one is the other plus a hundred — so they share the mapping and
            // the ticks, and part company only at the label.
            if (this.options.mode === PriceScaleMode.Percentage
                || this.options.mode === PriceScaleMode.IndexedTo100) {
                return percentageRatio(price, this.min, this.max, this.percentageBase);
            }
        }

        return (price - this.min) / (this.max - this.min);
    }

    priceFor(ratio) {
        if (FULL_BUILD && this.options.mode === PriceScaleMode.Logarithmic) {
            return logPrice(ratio, this.min, this.max);
        }

        return this.min + ratio * (this.max - this.min);
    }

    priceToY(price) {
        return this.innerBottom - this.ratioFor(price) * (this.innerBottom - this.innerTop);
    }

    yToPrice(y) {
        const ratio = (this.innerBottom - y) / (this.innerBottom - this.innerTop);

        return this.priceFor(ratio);
    }

    /**
     * Ticks span the full axis, not just the data range, so labels keep
     * appearing inside the `scaleMargins` padding the way they should.
     *
     * @return {{price: number, y: number}[]}
     */
    ticks() {
        const height = this.bottom - this.top;

        if (height <= 0 || ! Number.isFinite(this.min) || ! Number.isFinite(this.max)) {
            return [];
        }

        const highPrice = this.yToPrice(this.top);
        const lowPrice = this.yToPrice(this.bottom);
        const span = highPrice - lowPrice;

        if (span <= 0) {
            return [];
        }

        if (FULL_BUILD) {
            if (this.options.mode === PriceScaleMode.Logarithmic) {
                return logarithmicTicks(this, lowPrice, highPrice);
            }

            if (this.options.mode === PriceScaleMode.Percentage
                || this.options.mode === PriceScaleMode.IndexedTo100) {
                return percentageTicks(this, lowPrice, highPrice, height);
            }
        }

        // Derived from the smallest readable gap between labels rather than
        // from a rounded target count: rounding the count first can nudge the
        // raw step just past a rung of the ladder and double the real step.
        const step = this.niceStep(span * MIN_TICK_SPACING / height);
        const first = Math.ceil(lowPrice / step) * step;
        const ticks = [];

        for (let price = first; price <= highPrice; price += step) {
            const rounded = Math.abs(price) < step / 1e6 ? 0 : price;

            ticks.push({ price: rounded, y: this.priceToY(rounded) });
        }

        this.tickStep = step;

        return ticks;
    }

    niceStep(rawStep) {
        if (rawStep <= 0) {
            return 1;
        }

        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));

        for (const multiplier of STEP_MULTIPLIERS) {
            const candidate = multiplier * magnitude;

            if (candidate >= rawStep) {
                return candidate;
            }
        }

        return 10 * magnitude;
    }

    /**
     * Decimal places implied by the current tick step, so a 0.25 step never
     * renders three identical "63" labels.
     *
     * Floored at two: a wide range implies a whole-number step, and prices
     * written as "75" where every other chart on the page says "75.00" read as
     * a different quantity. Two is also what lightweight-charts defaults to.
     *
     * @return {number}
     */
    precision() {
        const step = this.tickStep ?? this.niceStep((this.max - this.min) / 6);

        if (! Number.isFinite(step) || step <= 0) {
            return DEFAULT_PRECISION;
        }

        return Math.min(8, Math.max(DEFAULT_PRECISION, Math.ceil(-Math.log10(step))));
    }
}
