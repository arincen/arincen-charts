/**
 * The public surface, described for editors and TypeScript users.
 *
 * These are JSDoc typedefs in a file that exports nothing: they exist so
 * `tsc --emitDeclarationOnly` can turn the engine's own comments into real
 * declarations. Without them the entry point declares `createChart(): any`,
 * which is types in name only — no autocomplete, no signature help, and no
 * error when a method is misspelled.
 *
 * Kept beside the code rather than hand-written as a `.d.ts` so the two cannot
 * drift: a method renamed here is a method renamed in the declarations.
 */

/**
 * @typedef {Object} Point A price at a moment.
 * @property {number|string|{year: number, month: number, day: number}} time
 * @property {number} [value] line, area, baseline and histogram series
 * @property {number} [open] bar-like series
 * @property {number} [high]
 * @property {number} [low]
 * @property {number} [close]
 * @property {string} [color] overrides the series colour for this point
 */

/**
 * @typedef {Object} PriceLineApi
 * @property {(options: Object) => void} applyOptions
 * @property {() => Object} options
 */

/**
 * @typedef {Object} PriceScaleApi
 * @property {(options: Object) => void} applyOptions
 * @property {() => Object} options
 * @property {() => number} width in CSS pixels
 * @property {(enabled: boolean) => void} setAutoScale
 */

/**
 * @typedef {Object} TimeScaleApi
 * @property {() => void} fitContent
 * @property {(options: Object) => void} applyOptions
 * @property {() => Object} options
 * @property {() => void} scrollToRealTime
 * @property {() => ({from: *, to: *}|null)} getVisibleRange
 * @property {() => ({from: number, to: number}|null)} getVisibleLogicalRange
 * @property {(time: *) => (number|null)} timeToCoordinate
 * @property {(x: number) => (*|null)} coordinateToTime
 * @property {() => number} width
 * @property {(handler: Function) => void} subscribeVisibleLogicalRangeChange
 * @property {(handler: Function) => void} unsubscribeVisibleLogicalRangeChange
 * @property {(handler: Function) => void} subscribeVisibleTimeRangeChange
 * @property {(handler: Function) => void} unsubscribeVisibleTimeRangeChange
 */

/**
 * @typedef {Object} SeriesApi
 * @property {() => string} seriesType
 * @property {(data: Point[]) => void} setData
 * @property {(point: Point) => void} update
 * @property {() => Object[]} data
 * @property {(options: Object) => void} applyOptions
 * @property {() => Object} options
 * @property {(markers: Object[]) => void} setMarkers
 * @property {() => Object[]} markers
 * @property {(primitive: Object) => void} attachPrimitive
 * @property {(primitive: Object) => void} detachPrimitive
 * @property {(options: Object) => PriceLineApi} createPriceLine
 * @property {(line: PriceLineApi) => void} removePriceLine
 * @property {() => PriceLineApi[]} priceLines
 * @property {() => PriceScaleApi} priceScale
 * @property {(price: number) => number} priceToCoordinate
 * @property {(y: number) => number} coordinateToPrice
 */

/**
 * @typedef {Object} PaneApi Full build only.
 * @property {() => number} paneIndex
 * @property {() => SeriesApi[]} getSeries
 * @property {() => number} getHeight
 * @property {(height: number) => void} setHeight
 * @property {() => number} getStretchFactor
 * @property {(factor: number) => void} setStretchFactor
 * @property {(index: number) => void} moveTo
 * @property {(id?: string) => PriceScaleApi} priceScale
 * @property {(primitive: Object) => void} attachPrimitive
 * @property {(primitive: Object) => void} detachPrimitive
 * @property {() => HTMLElement} getHTMLElement
 */

/**
 * @typedef {Object} ChartApi
 * @property {(definition: Object, options?: Object, paneIndex?: number) => SeriesApi} addSeries
 * @property {(series: SeriesApi) => void} removeSeries
 * @property {(options: Object) => void} applyOptions
 * @property {() => Object} options
 * @property {(width: number, height: number) => void} resize
 * @property {() => void} remove
 * @property {() => TimeScaleApi} timeScale
 * @property {(id?: string) => PriceScaleApi} priceScale
 * @property {(handler: Function) => void} subscribeCrosshairMove
 * @property {(handler: Function) => void} unsubscribeCrosshairMove
 * @property {(handler: Function) => void} subscribeClick
 * @property {(handler: Function) => void} unsubscribeClick
 * @property {() => HTMLCanvasElement} takeScreenshot
 * @property {() => HTMLElement} chartElement
 * @property {(paneView: Object, options?: Object, paneIndex?: number) => SeriesApi} [addCustomSeries] full build only
 * @property {() => PaneApi[]} [panes] full build only
 * @property {(index?: number) => PaneApi} [addPane] full build only
 * @property {(index: number) => void} [removePane] full build only
 * @property {(from: number, to: number) => void} [swapPanes] full build only
 */

export {};
