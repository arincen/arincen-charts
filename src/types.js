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
 * A moment, in any of the forms the chart accepts.
 *
 * A number is a UNIX timestamp — seconds, or milliseconds if it is large
 * enough to only make sense as milliseconds. A string is `YYYY-MM-DD` or
 * `YYYY-MM-DD HH:mm:ss`. The object form is a business day.
 *
 * @typedef {number|string|{year: number, month: number, day: number}} Time
 */

/**
 * @typedef {Object} Point A price at a moment.
 * @property {Time} time
 * @property {number} [value] line, area, baseline and histogram series
 * @property {number} [open] bar-like series
 * @property {number} [high]
 * @property {number} [low]
 * @property {number} [close]
 * @property {string} [color] overrides the series or body colour for this one reading
 * @property {string} [borderColor] overrides the candle outline for this one reading
 * @property {string} [wickColor] overrides the candle wick for this one reading
 * @property {Object} [customValues] ignored by the library, carried through for plugins
 */

/**
 * A gap. A reading with a time and no value leaves the axis its place while
 * drawing nothing there, which is how a holiday stays a hole instead of being
 * bridged by a straight line.
 *
 * @typedef {Object} Whitespace
 * @property {Time} time
 * @property {Object} [customValues]
 */

/* ------------------------------------------------------------ primitives */

/**
 * The canvas handed to a primitive's renderer.
 *
 * Two coordinate spaces, and the choice matters. Bitmap space is device
 * pixels, where a one-pixel line stays one physical pixel on a retina screen
 * instead of blurring across two — right for anything crisp. Media space is
 * CSS pixels, which is what a series' own coordinates are already in — right
 * for anything positioned from `priceToCoordinate`.
 *
 * @typedef {Object} RenderTarget
 * @property {(callback: (scope: BitmapScope) => void) => void} useBitmapCoordinateSpace
 * @property {(callback: (scope: MediaScope) => void) => void} useMediaCoordinateSpace
 */

/**
 * @typedef {Object} BitmapScope
 * @property {CanvasRenderingContext2D} context
 * @property {{width: number, height: number}} bitmapSize device pixels
 * @property {{width: number, height: number}} mediaSize CSS pixels
 * @property {number} horizontalPixelRatio
 * @property {number} verticalPixelRatio
 */

/**
 * @typedef {Object} MediaScope
 * @property {CanvasRenderingContext2D} context
 * @property {{width: number, height: number}} mediaSize CSS pixels
 */

/**
 * @typedef {Object} PrimitiveRenderer
 * @property {(target: RenderTarget) => void} [draw]
 * @property {(target: RenderTarget) => void} [drawBackground] beneath the series
 */

/**
 * @typedef {Object} PrimitivePaneView
 * @property {() => ('bottom'|'normal'|'top')} [zOrder]
 * @property {() => PrimitiveRenderer} renderer
 */

/**
 * A label a primitive puts on an axis.
 *
 * @typedef {Object} PrimitiveAxisView
 * @property {() => number} coordinate distance from the top, or from the left on the time axis
 * @property {() => (number|undefined)} [fixedCoordinate]
 * @property {() => string} text
 * @property {() => string} textColor
 * @property {() => string} backColor
 * @property {() => boolean} [visible]
 * @property {() => boolean} [tickVisible] the short mark joining the label to the axis
 */

/**
 * What `hitTest` returns when something of the primitive's is under the
 * pointer.
 *
 * Ranking, when several answer: the layer decides first, then a point beats
 * anything else however far away — a drawing's handles sit on top of its own
 * fill, and a shape whose handles cannot be grabbed cannot be resized — then
 * distance, then the order they were attached in.
 *
 * @typedef {Object} PrimitiveHoveredItem
 * @property {string} externalId reaches the caller as `hoveredObjectId`
 * @property {'bottom'|'normal'|'top'} zOrder
 * @property {string} [cursorStyle] any CSS cursor
 * @property {number} [distance] in CSS pixels; nearer wins on the same layer
 * @property {number} [hitTestPriority] 0 a region, 1 a line, 2 a point
 * @property {boolean} [isBackground]
 */

/**
 * What `attached` is handed.
 *
 * @typedef {Object} SeriesAttachedParameter
 * @property {ChartApi} chart
 * @property {SeriesApi} series
 * @property {() => void} requestUpdate ask for a repaint; do not poke an option
 */

/**
 * Anything that draws on a chart it does not own.
 *
 * Every member is optional: a primitive that only draws implements
 * `paneViews`, and one that only labels an axis implements `priceAxisViews`.
 *
 * @typedef {Object} Primitive
 * @property {(params: SeriesAttachedParameter) => void} [attached]
 * @property {() => void} [detached]
 * @property {() => void} [updateAllViews] called once a frame, before anything paints
 * @property {() => PrimitivePaneView[]} [paneViews]
 * @property {() => PrimitivePaneView[]} [priceAxisPaneViews] draws inside the price axis
 * @property {() => PrimitivePaneView[]} [timeAxisPaneViews]
 * @property {() => PrimitiveAxisView[]} [priceAxisViews] labels on the price axis
 * @property {() => PrimitiveAxisView[]} [timeAxisViews]
 * @property {(x: number, y: number) => (PrimitiveHoveredItem|null)} [hitTest]
 * @property {(from: number, to: number) => ({priceRange: {minValue: number, maxValue: number}}|null)} [autoscaleInfo]
 *   ask the scale for room; it only ever widens
 */

/**
 * A series drawn by the caller.
 *
 * @typedef {Object} CustomSeriesPaneView
 * @property {() => PrimitiveRenderer} renderer
 * @property {(data: Object, options: Object) => void} update
 * @property {(item: Object) => number[]} [priceValueBuilder] the prices the axis should see
 * @property {(item: Object) => boolean} [isWhitespace]
 * @property {() => Object} [defaultOptions]
 * @property {() => void} [destroy] called when the series or the chart is removed
 */

/* -------------------------------------------------------------- options */

/**
 * @typedef {Object} LayoutOptions
 * @property {{type: 'solid'|'gradient', color?: string, topColor?: string, bottomColor?: string}} [background]
 * @property {string} [textColor]
 * @property {number} [fontSize]
 * @property {string} [fontFamily]
 * @property {boolean} [attributionLogo] the wordmark; on by default, removable in one option
 * @property {'srgb'|'display-p3'} [colorSpace] passed to the canvas
 * @property {{separatorColor?: string, separatorHoverColor?: string, enableResize?: boolean}} [panes] full build only
 */

/**
 * @typedef {Object} LocalizationOptions
 * @property {string} [locale] a BCP 47 tag; dates and numbers are formatted with it
 * @property {(price: number) => string} [priceFormatter]
 * @property {(time: number) => string} [timeFormatter]
 * @property {string} [dateFormat] a pattern in `yyyy MM dd HH mm` and friends
 * @property {(percent: number) => string} [percentageFormatter] for percentage and indexed scales
 */

/**
 * @typedef {Object} GridLineOptions
 * @property {boolean} [visible]
 * @property {string} [color]
 * @property {number} [style] a `LineStyle`
 */

/**
 * @typedef {Object} GridOptions
 * @property {GridLineOptions} [vertLines]
 * @property {GridLineOptions} [horzLines]
 */

/**
 * @typedef {Object} CrosshairLineOptions
 * @property {boolean} [visible]
 * @property {string} [color]
 * @property {number} [width]
 * @property {number} [style] a `LineStyle`
 * @property {boolean} [labelVisible] the badge on the axis
 * @property {string} [labelBackgroundColor]
 */

/**
 * @typedef {Object} CrosshairOptions
 * @property {number} [mode] a `CrosshairMode`
 * @property {CrosshairLineOptions} [vertLine]
 * @property {CrosshairLineOptions} [horzLine]
 * @property {boolean} [doNotSnapToHiddenSeriesIndices] on by default here, off in theirs
 */

/**
 * @typedef {Object} PriceScaleOptions
 * @property {boolean} [visible]
 * @property {boolean} [autoScale]
 * @property {number} [mode] a `PriceScaleMode`
 * @property {boolean} [borderVisible]
 * @property {string} [borderColor]
 * @property {{top: number, bottom: number}} [scaleMargins] fractions of the plot height
 * @property {number} [minimumWidth]
 * @property {boolean} [ticksVisible] a short mark joining each label to the axis
 * @property {boolean} [alignLabels] nudge crowded badges apart rather than letting them stack
 * @property {boolean} [entireTextOnly] drop a corner label rather than clip it
 * @property {boolean} [invertScale] upside down, so a falling market reads as a rising line
 */

/**
 * @typedef {Object} TimeScaleOptions
 * @property {boolean} [visible]
 * @property {boolean} [borderVisible]
 * @property {string} [borderColor]
 * @property {boolean} [timeVisible] show the time of day, not only the date
 * @property {boolean} [secondsVisible]
 * @property {boolean} [fixLeftEdge] refuse to scroll past the first bar
 * @property {boolean} [fixRightEdge]
 * @property {number} [rightOffset] bars of whitespace held to the right of the last one
 * @property {number} [barSpacing] pixels between bar centres
 * @property {number} [minBarSpacing]
 * @property {number} [maxBarSpacing] zero for the default ceiling
 * @property {(time: number, weight: number, locale: string) => (string|undefined)} [tickMarkFormatter]
 *   return nothing to let the built-in formatting answer
 * @property {boolean} [ticksVisible]
 * @property {boolean} [allowBoldLabels] set the coarsest boundary on screen in bold
 * @property {boolean} [lockVisibleTimeRangeOnResize] hold the span, not the bar width
 * @property {boolean} [rightBarStaysOnScroll] anchor a wheel zoom at the right edge
 * @property {boolean} [shiftVisibleRangeOnNewBar] follow new bars, but only at the live edge
 * @property {boolean} [enableConflation] full build only; merge readings that share a pixel
 * @property {number} [conflationThresholdFactor] full build only; one merges only the indistinguishable
 */

/**
 * @typedef {Object} HandleScrollOptions
 * @property {boolean} [mouseWheel]
 * @property {boolean} [pressedMouseMove]
 * @property {boolean} [horzTouchDrag]
 * @property {boolean} [vertTouchDrag]
 */

/**
 * @typedef {Object} HandleScaleOptions
 * @property {boolean} [mouseWheel]
 * @property {boolean} [pinch]
 * @property {boolean} [axisPressedMouseMove]
 * @property {boolean} [axisDoubleClickReset]
 */

/**
 * Options for the chart itself.
 *
 * `handleScroll` and `handleScale` also accept a plain `false`, which turns
 * every one of their flags off — the shorthand a plugin uses to claim a drag.
 *
 * @typedef {Object} ChartOptions
 * @property {number} [width] ignored while `autoSize` is on
 * @property {number} [height]
 * @property {boolean} [autoSize] follow the container, when the browser can observe it
 * @property {LayoutOptions} [layout]
 * @property {LocalizationOptions} [localization]
 * @property {GridOptions} [grid]
 * @property {CrosshairOptions} [crosshair]
 * @property {PriceScaleOptions} [rightPriceScale]
 * @property {PriceScaleOptions} [leftPriceScale] full build only
 * @property {TimeScaleOptions} [timeScale]
 * @property {HandleScrollOptions|boolean} [handleScroll]
 * @property {HandleScaleOptions|boolean} [handleScale]
 * @property {{exitMode: 'onTouchEnd'|'onNextTap'}} [trackingMode] the touch crosshair
 * @property {{touch?: boolean, mouse?: boolean}} [kineticScroll] full build only
 * @property {'light'|'dark'|'auto'|null} [theme] a palette laid under everything else
 * @property {boolean} [loading] say a request is in flight
 * @property {boolean} [handleKeyboard] full build only; on by default
 * @property {((error: unknown, source: string) => void)|null} [onError] told when code
 *   the chart does not own throws; the chart survives either way
 * @property {boolean} [validateData] check what setData and update are given, and
 *   say what is wrong with it
 * @property {{from: string|number, to: string|number, days?: number[], timeZone?: string,
 *   color?: string}|null} [sessions] shade the hours a market is shut; full build only
 */

/**
 * Options every series has, whatever it draws.
 *
 * @typedef {Object} SeriesOptionsCommon
 * @property {boolean} [visible]
 * @property {string} [title] shown on a tag beside the last-value badge
 * @property {boolean} [priceLineVisible]
 * @property {string} [priceLineColor]
 * @property {number} [priceLineWidth]
 * @property {number} [priceLineStyle] a `LineStyle`
 * @property {number} [priceLineSource] a `PriceLineSource`; full build only
 * @property {boolean} [lastValueVisible] the badge on the price axis
 * @property {boolean} [crosshairMarkerVisible]
 * @property {number} [crosshairMarkerRadius]
 * @property {string} [crosshairMarkerBorderColor]
 * @property {string} [crosshairMarkerBackgroundColor]
 * @property {number} [crosshairMarkerBorderWidth]
 * @property {number} [lastPriceAnimation] a `LastPriceAnimationMode`; full build only
 * @property {boolean} [tintAxes] carry this series' fill on into the axis gutters
 * @property {number} [bodyRadius] corner radius on a candle body, in pixels
 * @property {boolean} [baseLineVisible] the zero of a percentage or indexed axis; full build only
 * @property {string} [baseLineColor]
 * @property {number} [baseLineWidth]
 * @property {number} [baseLineStyle]
 * @property {string} [priceScaleId] which scale to draw against; full build only
 * @property {(basis: () => ({priceRange: {minValue: number, maxValue: number}})) => ({priceRange: {minValue: number, maxValue: number}, margins?: {above?: number, below?: number}}|null)} [autoscaleInfoProvider] full build only
 * @property {number} [conflationThresholdFactor] overrides the chart's; full build only
 */

/**
 * @typedef {SeriesOptionsCommon & {
 *   color?: string,
 *   lineWidth?: number,
 *   lineStyle?: number,
 *   lineType?: number,
 *   pointMarkersVisible?: boolean,
 *   pointMarkersRadius?: number
 * }} LineSeriesOptions
 */

/**
 * @typedef {SeriesOptionsCommon & {
 *   lineColor?: string,
 *   topColor?: string,
 *   bottomColor?: string,
 *   lineWidth?: number,
 *   lineStyle?: number,
 *   lineType?: number,
 *   invertFilledArea?: boolean,
 *   pointMarkersVisible?: boolean,
 *   pointMarkersRadius?: number
 * }} AreaSeriesOptions
 */

/**
 * @typedef {SeriesOptionsCommon & {
 *   baseValue?: {type: "price", price: number},
 *   topLineColor?: string,
 *   topFillColor1?: string,
 *   topFillColor2?: string,
 *   bottomLineColor?: string,
 *   bottomFillColor1?: string,
 *   bottomFillColor2?: string,
 *   lineWidth?: number,
 *   lineStyle?: number,
 *   lineType?: number,
 *   pointMarkersVisible?: boolean,
 *   pointMarkersRadius?: number
 * }} BaselineSeriesOptions
 */

/**
 * @typedef {SeriesOptionsCommon & {
 *   upColor?: string,
 *   downColor?: string,
 *   borderVisible?: boolean,
 *   borderUpColor?: string,
 *   borderDownColor?: string,
 *   wickVisible?: boolean,
 *   wickUpColor?: string,
 *   wickDownColor?: string
 * }} CandlestickSeriesOptions
 */

/**
 * @typedef {SeriesOptionsCommon & {
 *   upColor?: string,
 *   downColor?: string,
 *   openVisible?: boolean,
 *   thinBars?: boolean
 * }} BarSeriesOptions
 */

/**
 * @typedef {SeriesOptionsCommon & {
 *   color?: string,
 *   base?: number
 * }} HistogramSeriesOptions
 */

/**
 * Whatever the series in hand happens to be. A union rather than a generic,
 * so `addSeries(CandlestickSeries, …)` takes candle options without every
 * call site having to name a type parameter.
 *
 * @typedef {LineSeriesOptions|AreaSeriesOptions|BaselineSeriesOptions|CandlestickSeriesOptions|BarSeriesOptions|HistogramSeriesOptions} SeriesOptions
 */

/**
 * @typedef {Object} PriceLineOptions
 * @property {number} price
 * @property {string} [color]
 * @property {number} [lineWidth]
 * @property {number} [lineStyle] a `LineStyle`
 * @property {boolean} [axisLabelVisible] the badge on the price axis
 * @property {string} [axisLabelColor]
 * @property {string} [axisLabelTextColor]
 * @property {string} [title]
 */

/**
 * @typedef {Object} SeriesMarker
 * @property {Time} time
 * @property {'aboveBar'|'belowBar'|'inBar'} position
 * @property {'circle'|'square'|'arrowUp'|'arrowDown'} shape
 * @property {string} color
 * @property {string} [text]
 * @property {number} [size] a multiplier on the size taken from the bar spacing
 */

/**
 * What a crosshair or click handler is given.
 *
 * @typedef {Object} MouseEventParams
 * @property {Time} [time] undefined when the pointer has left the plot
 * @property {number} [logical] the bar index under the pointer
 * @property {{x: number, y: number}} [point]
 * @property {Map<SeriesApi, Object>} seriesData each series' reading at that moment
 * @property {SeriesApi} [hoveredSeries]
 * @property {*} [hoveredObjectId] the `externalId` a primitive returned from `hitTest`
 * @property {Event} [sourceEvent]
 */

/**
 * @typedef {Object} PriceLineApi
 * @property {(options: PriceLineOptions) => void} applyOptions
 * @property {() => PriceLineOptions} options
 */

/**
 * @typedef {Object} PriceScaleApi
 * @property {(options: PriceScaleOptions) => void} applyOptions
 * @property {() => PriceScaleOptions} options
 * @property {() => number} width in CSS pixels
 * @property {(enabled: boolean) => void} setAutoScale
 */

/**
 * @typedef {Object} TimeScaleApi
 * @property {() => void} fitContent
 * @property {(options: TimeScaleOptions) => void} applyOptions
 * @property {() => TimeScaleOptions} options
 * @property {() => void} scrollToRealTime
 * @property {() => ({from: Time, to: Time}|null)} getVisibleRange
 * @property {() => ({from: number, to: number}|null)} getVisibleLogicalRange
 * @property {(time: Time) => (number|null)} timeToCoordinate
 * @property {(x: number) => (Time|null)} coordinateToTime
 * @property {(range: {from: Time, to: Time}) => void} setVisibleRange
 * @property {(range: {from: number, to: number}) => void} setVisibleLogicalRange
 * @property {() => number} scrollPosition
 * @property {(position: number, animated?: boolean) => void} scrollToPosition
 * @property {() => void} resetTimeScale
 * @property {(x: number) => (number|null)} coordinateToLogical
 * @property {(logical: number) => (number|null)} logicalToCoordinate
 * @property {(time: Time, findNearest?: boolean) => (number|null)} timeToIndex
 * @property {() => number} width
 * @property {() => number} height
 * @property {(handler: (size: {width: number, height: number}) => void) => void} subscribeSizeChange
 * @property {(handler: (size: {width: number, height: number}) => void) => void} unsubscribeSizeChange
 * @property {(handler: Function) => void} subscribeVisibleLogicalRangeChange
 * @property {(handler: Function) => void} unsubscribeVisibleLogicalRangeChange
 * @property {(handler: Function) => void} subscribeVisibleTimeRangeChange
 * @property {(handler: Function) => void} unsubscribeVisibleTimeRangeChange
 */

/**
 * @typedef {Object} SeriesApi
 * @property {() => string} seriesType
 * @property {(data: (Point|Whitespace)[]) => void} setData
 * @property {(point: Point|Whitespace) => void} update
 * @property {() => (Point|Whitespace)[]} data
 * @property {(options: SeriesOptions) => void} applyOptions
 * @property {() => SeriesOptions} options
 * @property {(markers: SeriesMarker[]) => void} setMarkers
 * @property {() => SeriesMarker[]} markers
 * @property {(primitive: Primitive) => void} attachPrimitive
 * @property {(primitive: Primitive) => void} detachPrimitive
 * @property {(options: PriceLineOptions) => PriceLineApi} createPriceLine
 * @property {(line: PriceLineApi) => void} removePriceLine
 * @property {() => PriceLineApi[]} priceLines
 * @property {() => PriceScaleApi} priceScale
 * @property {(price: number) => number} priceToCoordinate
 * @property {(y: number) => number} coordinateToPrice
 * @property {(range: {from: number, to: number}) => (BarsInfo|null)} barsInLogicalRange
 * @property {(index: number, seekDirection?: number) => (Point|null)} dataByIndex
 * @property {() => {format: (price: number) => string}} priceFormatter
 * @property {(handler: Function) => void} subscribeDataChanged
 * @property {(handler: Function) => void} unsubscribeDataChanged
 * @property {() => (Point|null)} pop
 * @property {() => number} seriesOrder
 * @property {(order: number) => void} setSeriesOrder
 */

/**
 * How much of a series lies inside a logical range, and how much is left over.
 *
 * `barsBefore` and `barsAfter` are positive when bars exist off-screen on that
 * side, and negative when the series has run out and the viewport is over
 * whitespace — which is what makes `if (barsBefore < 50) loadMore()` work.
 *
 * @typedef {Object} BarsInfo
 * @property {number} barsBefore
 * @property {number} barsAfter
 * @property {*} from time of the first bar in range
 * @property {*} to time of the last bar in range
 * @property {number} length bars actually carrying data
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
 * @property {(primitive: Primitive) => void} attachPrimitive
 * @property {(primitive: Primitive) => void} detachPrimitive
 * @property {() => HTMLElement} getHTMLElement
 */

/**
 * @typedef {Object} ChartApi
 * @property {(definition: Object, options?: SeriesOptions, paneIndex?: number) => SeriesApi} addSeries
 * @property {(series: SeriesApi) => void} removeSeries
 * @property {(options: ChartOptions) => void} applyOptions
 * @property {() => ChartOptions} options
 * @property {(width: number, height: number) => void} resize
 * @property {() => void} remove
 * @property {() => TimeScaleApi} timeScale
 * @property {(id?: string) => PriceScaleApi} priceScale
 * @property {(handler: (param: MouseEventParams) => void) => void} subscribeCrosshairMove
 * @property {(handler: (param: MouseEventParams) => void) => void} unsubscribeCrosshairMove
 * @property {(handler: (param: MouseEventParams) => void) => void} subscribeClick
 * @property {(handler: (param: MouseEventParams) => void) => void} unsubscribeClick
 * @property {(handler: (param: MouseEventParams) => void) => void} subscribeDblClick
 * @property {(handler: (param: MouseEventParams) => void) => void} unsubscribeDblClick
 * @property {() => boolean} autoSizeActive
 * @property {(price: number, horizontalPosition: Time, series: SeriesApi) => void} setCrosshairPosition
 * @property {() => void} clearCrosshairPosition
 * @property {(paneIndex?: number) => {width: number, height: number}} paneSize
 * @property {() => HTMLCanvasElement} takeScreenshot
 * @property {() => HTMLElement} chartElement
 * @property {(paneView: CustomSeriesPaneView, options?: SeriesOptionsCommon, paneIndex?: number) => SeriesApi} [addCustomSeries] full build only
 * @property {() => PaneApi[]} [panes] full build only
 * @property {(index?: number) => PaneApi} [addPane] full build only
 * @property {(index: number) => void} [removePane] full build only
 * @property {(from: number, to: number) => void} [swapPanes] full build only
 */

export {};
