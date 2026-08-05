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
