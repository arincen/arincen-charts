/**
 * Watermarks, as primitives rather than as a chart option.
 *
 * lightweight-charts moved these out of the core in v5 for the same reason we
 * never put them in: a watermark is drawing, and drawing is what the primitive
 * contract is for. Anyone who wants one that we did not think of writes their
 * own against the same interface.
 */

const DEFAULTS = {
    visible: true,
    text: '',
    color: 'rgba(0, 0, 0, 0.08)',
    fontSize: 48,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontStyle: 'bold',
    horzAlign: 'center',
    vertAlign: 'center',
};

function place(align, size, padding) {
    if (align === 'left' || align === 'top') {
        return padding;
    }

    if (align === 'right' || align === 'bottom') {
        return size - padding;
    }

    return size / 2;
}

const ALIGNMENT = { left: 'left', right: 'right', center: 'center' };
const BASELINE = { top: 'top', bottom: 'bottom', center: 'middle' };

/**
 * @param {Object} [options]
 * @return {Object} a primitive to attach to a series or a pane
 */
export function createTextWatermark(options) {
    const settings = { ...DEFAULTS, ...(options ?? {}) };

    return {
        updateAllViews: () => {},
        applyOptions: (next) => Object.assign(settings, next ?? {}),
        options: () => settings,
        paneViews: () => [{
            // Beneath the series: a watermark that covers the data it labels
            // has stopped being a watermark.
            zOrder: () => 'bottom',
            renderer: () => ({
                draw(target) {
                    if (! settings.visible || ! settings.text) {
                        return;
                    }

                    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                        const padding = settings.fontSize / 2;

                        context.save();
                        context.font = `${settings.fontStyle} ${settings.fontSize}px ${settings.fontFamily}`;
                        context.fillStyle = settings.color;
                        context.textAlign = ALIGNMENT[settings.horzAlign] ?? 'center';
                        context.textBaseline = BASELINE[settings.vertAlign] ?? 'middle';
                        context.fillText(
                            settings.text,
                            place(settings.horzAlign, mediaSize.width, padding),
                            place(settings.vertAlign, mediaSize.height, padding),
                        );
                        context.restore();
                    });
                },
            }),
        }],
    };
}

const IMAGE_DEFAULTS = {
    visible: true,
    maxHeight: undefined,
    maxWidth: undefined,
    padding: 0,
    alpha: 1,
    horzAlign: 'center',
    vertAlign: 'center',
};

/**
 * The same, with a picture instead of a word.
 *
 * The image is loaded once and the chart is told when it arrives — a watermark
 * that only appeared after the next unrelated repaint would look like a bug on
 * a static chart, which is precisely the kind of chart a logo is put on.
 *
 * Scaled to fit inside whatever bounds were given while keeping its
 * proportions, because a squashed logo is worse than no logo.
 *
 * @param {string} url
 * @param {Object} [options]
 * @return {Object} a primitive to attach to a series or a pane
 */
export function createImageWatermark(url, options) {
    const settings = { ...IMAGE_DEFAULTS, ...(options ?? {}) };
    const image = typeof Image === 'undefined' ? null : new Image();
    let ready = false;
    let requestUpdate = null;

    if (image) {
        image.onload = () => {
            ready = true;
            requestUpdate?.();
        };
        image.src = url;
    }

    const scaled = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const room = Math.min(
            settings.maxWidth ? settings.maxWidth / width : Infinity,
            settings.maxHeight ? settings.maxHeight / height : Infinity,
            1,
        );

        return { width: width * room, height: height * room };
    };

    return {
        updateAllViews: () => {},
        applyOptions: (next) => Object.assign(settings, next ?? {}),
        options: () => settings,
        attached: (params) => {
            requestUpdate = params?.requestUpdate ?? null;
        },
        detached: () => {
            requestUpdate = null;
        },
        paneViews: () => [{
            zOrder: () => 'bottom',
            renderer: () => ({
                draw(target) {
                    if (! settings.visible || ! ready) {
                        return;
                    }

                    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                        const { width, height } = scaled();
                        const left = place(settings.horzAlign, mediaSize.width, settings.padding + width / 2) - width / 2;
                        const top = place(settings.vertAlign, mediaSize.height, settings.padding + height / 2) - height / 2;

                        context.save();
                        context.globalAlpha = settings.alpha;
                        context.drawImage(image, left, top, width, height);
                        context.restore();
                    });
                },
            }),
        }],
    };
}
