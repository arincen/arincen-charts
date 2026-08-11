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

/**
 * Enough of `HTMLElement` for `instanceof` to mean something.
 *
 * The chart itself never needed it — it draws on a canvas and touches almost no
 * DOM. A tooltip is DOM, and code that accepts either a string or an element
 * has to be able to tell them apart.
 */
globalThis.HTMLElement = class HTMLElement {};

/**
 * A style object where `cssText` and the individual properties agree.
 *
 * A plain object took `style.cssText = 'display:flex'` and left `style.display`
 * undefined, so a test asking how something was laid out got nothing back from
 * an element that had been laid out perfectly well. A real element reflects one
 * into the other, and code legitimately sets whichever is convenient.
 */
function style() {
    const declaration = {};

    Object.defineProperty(declaration, 'cssText', {
        get() {
            return Object.entries(declaration)
                .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
                .join(';');
        },
        set(text) {
            for (const key of Object.keys(declaration)) {
                delete declaration[key];
            }

            for (const rule of String(text).split(';')) {
                const [property, ...rest] = rule.split(':');

                if (! rest.length) {
                    continue;
                }

                const name = property.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());

                declaration[name] = rest.join(':').trim();
            }
        },
    });

    return declaration;
}

function element(tag) {
    const node = Object.create(globalThis.HTMLElement.prototype);
    let text = '';

    Object.assign(node, {
        tagName: tag,
        style: style(),
        children: [],
        dataset: {},
        className: '',
        parentNode: null,
        clientWidth: 1500,
        clientHeight: 400,

        // Zero until a test says otherwise. A real browser measures these after
        // layout, and code that positions itself from them has to cope with
        // both — so the default is the awkward one.
        offsetWidth: 0,
        offsetHeight: 0,

        appendChild(child) {
            node.children.push(child);
            child.parentNode = node;

            return child;
        },
        replaceChildren(...nodes) {
            node.children.forEach((child) => { child.parentNode = null; });
            node.children = nodes;
            nodes.forEach((child) => { child.parentNode = node; });
            text = '';
        },
        removeChild(child) {
            node.children = node.children.filter((existing) => existing !== child);
            child.parentNode = null;
        },
        remove() {
            node.parentNode?.removeChild(node);
        },
        listeners: {},
        addEventListener(type, handler) {
            (node.listeners[type] ??= []).push(handler);
        },
        removeEventListener(type, handler) {
            node.listeners[type] = (node.listeners[type] ?? []).filter((existing) => existing !== handler);
        },

        /** Fires the handlers a test has no other way to reach. */
        dispatch(type, event = {}) {
            for (const handler of node.listeners[type] ?? []) {
                handler({ preventDefault() {}, ...event });
            }
        },

        // Stored rather than swallowed. ARIA is attributes and nothing else,
        // so a `setAttribute` that forgets is a chart whose accessibility
        // cannot be tested at all — which is how it comes to be untested.
        attributes: {},
        setAttribute(name, value) {
            node.attributes[name] = String(value);
        },
        getAttribute: (name) => node.attributes[name] ?? null,
        removeAttribute(name) {
            delete node.attributes[name];
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1500, height: 400 }),
    });

    Object.defineProperty(node, 'textContent', {
        // Configurable, as it is on a real element: a test that needs to watch
        // what is written to a live region has no other way in.
        configurable: true,
        get: () => text + node.children.map((child) => child.textContent ?? '').join(''),
        set: (value) => {
            node.children = [];
            text = String(value);
        },
    });

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
