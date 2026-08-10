/**
 * Just enough browser to construct a real chart.
 *
 * Every test until now exercised a function in isolation, so a chart that
 * threw on every frame passed all of them: `drawSeries` called a method that
 * had never been added, and nothing noticed because nothing had ever built a
 * chart and asked it to draw. The suite was testing the parts and not the
 * thing.
 *
 * Import this first, like the full-build flag.
 */

const canvas = () => ({
    width: 0,
    height: 0,
    style: {},
    getContext: () => context(),
});

const context = () => new Proxy({
    measureText: (text) => ({ width: String(text).length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
}, {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: () => true,
});

function element(tag) {
    const node = {
        tagName: tag,
        style: {},
        children: [],
        dataset: {},
        clientWidth: 1500,
        clientHeight: 400,
        appendChild(child) {
            node.children.push(child);

            return child;
        },
        removeChild() {},
        remove() {},
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1500, height: 400 }),
    };

    return tag === 'canvas' ? Object.assign(node, canvas()) : node;
}

globalThis.document = {
    createElement: element,
    documentElement: { lang: 'en' },
};

globalThis.window = {
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
};

globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(0), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

/** A container the chart can be built inside. */
export const container = () => element('div');

/**
 * Renders a chart with the drawing recorded rather than painted, and reports
 * how much was drawn — or rethrows, which is the point.
 *
 * @param {Object} chart the public API
 * @return {number} rectangles painted
 */
export function renderCounting(chart) {
    let drawn = 0;

    const recording = new Proxy({
        measureText: (text) => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }),
    }, {
        get: (target, key) => {
            if (key in target) {
                return target[key];
            }

            return key === 'fillRect' || key === 'strokeRect' ? () => { drawn++; } : () => {};
        },
        set: () => true,
    });

    chart._internal.mainCtx = recording;
    chart._internal.overlayCtx = recording;
    chart._internal.render();

    return drawn;
}
