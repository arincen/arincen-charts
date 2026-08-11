# In a mobile app

There is no Swift package and no Kotlin artifact. There is a 25 KB script that
runs in a `WKWebView` or an Android `WebView`, which is what a native charting
wrapper is underneath anyway — the wrapper is a native-language API over the
same JavaScript.

This page is the wrapper, written out. It is how Arincen's own app draws its
charts, so what follows is what production does rather than what ought to work.

## The page the WebView loads

One file, no build step, no network beyond your own data.

```html
<!doctype html>
<html>
<head>
    <meta charset="utf-8">

    <!-- Without this the WebView renders at 980px and scales down: every
         line is soft and every label is small. -->
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

    <style>
        html, body { margin: 0; height: 100%; background: transparent; }
        #chart { position: absolute; inset: 0; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script src="arincen-charts.standalone.js"></script>
    <script>
        const chart = ArincenCharts.createChart(document.getElementById('chart'), {
            autoSize: true,
            layout: { background: { type: 'solid', color: 'transparent' }, attributionLogo: false },
        });

        const series = chart.addSeries(ArincenCharts.AreaSeries, {
            lineColor: '#22ab94',
            topColor: 'rgba(34, 171, 148, 0.36)',
            bottomColor: 'rgba(34, 171, 148, 0)',
            lineWidth: 2,
        });

        // What the native side calls.
        window.setChartData = (json) => {
            series.setData(JSON.parse(json));
            chart.timeScale().fitContent();
        };

        window.pushTick = (json) => series.update(JSON.parse(json));

        window.setTheme = (name) => chart.applyOptions({ theme: name });

        // What the native side listens for.
        chart.subscribeCrosshairMove((param) => {
            if (! param.time) {
                return;
            }

            const point = param.seriesData.get(series);

            send({ type: 'crosshair', time: param.time, value: point?.value });
        });

        function send(message) {
            // iOS
            window.webkit?.messageHandlers?.chart?.postMessage(message);
            // Android
            window.Native?.onChartEvent(JSON.stringify(message));
        }

        send({ type: 'ready' });
    </script>
</body>
</html>
```

**Ship the script and the page inside the app bundle**, not from your server.
A chart that waits for a network round trip before drawing is a white rectangle
for as long as the connection is bad, and the file is 25 KB.

## iOS

```swift
import WebKit

final class ChartView: UIViewController, WKScriptMessageHandler {
    private var web: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "chart")

        web = WKWebView(frame: view.bounds, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.bounces = false

        let url = Bundle.main.url(forResource: "chart", withExtension: "html")!
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())

        view.addSubview(web)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }

        if body["type"] as? String == "ready" {
            send(candles)   // only now: before this, the functions do not exist
        }
    }

    func send(_ candles: [Candle]) {
        let json = String(data: try! JSONEncoder().encode(candles), encoding: .utf8)!

        web.evaluateJavaScript("setChartData(\(json.debugDescription))")
    }
}
```

**Wait for `ready`.** `evaluateJavaScript` before the page's script has run is
a silent no-op — the call finds no function and the chart stays empty. Every
"it works on my simulator and not on a cold device" report is this.

**`isOpaque = false` and a clear background**, or the WebView paints white
behind a transparent chart and your dark mode has a white box in it.

## Android

```kotlin
class ChartView(context: Context) : WebView(context) {
    init {
        settings.javaScriptEnabled = true
        setBackgroundColor(Color.TRANSPARENT)

        addJavascriptInterface(object {
            @JavascriptInterface
            fun onChartEvent(json: String) {
                // Called on a WebView thread, not the main one.
                post { handle(json) }
            }
        }, "Native")

        loadUrl("file:///android_asset/chart.html")
    }

    fun setData(json: String) {
        evaluateJavascript("setChartData(${JSONObject.quote(json)})", null)
    }
}
```

**`@JavascriptInterface` methods run on a background thread.** Touching a view
from one throws, and the crash is far from the cause.

**Quote the JSON properly.** `JSONObject.quote` on Android and
`debugDescription` on iOS — string interpolation without them breaks on the
first apostrophe in a symbol name and produces a syntax error nobody sees.

## What already works, and what does not

| | |
|---|---|
| pinch to zoom, drag to pan | works; the chart handles touch itself |
| long press for a crosshair | works, and the browser's own "select and copy" bubble is already refused |
| double-tap zoom | disable it in the WebView, or the page zooms instead of the chart |
| a retina screen | handled: the canvas is sized by `devicePixelRatio` |
| dark mode | `chart.applyOptions({ theme })` from native; do not reload the page |

**Do not reload the page to change anything.** A reload is a blank frame, a
lost zoom and a fresh 25 KB parse. Everything is a call: `applyOptions`,
`setData`, `update`.

## Caching, which will catch you

If you do serve the script from your own domain rather than bundling it, a
WebView caches it harder than a browser does, and an update that works in
Safari can serve a month-old file inside the app.

```html
<script src="/js/arincen-charts.standalone.js?v=2026-08-11"></script>
```

Change that string whenever the file changes. We ship the file's modification
time in ours.

## What next

- [No build step](/frameworks/script-tag) — the same standalone build, on the web
- [Crosshair and interaction](/guide/interaction#touch) — the touch options in full
- [A chart an agent can read](/agents) — `toText` is the same call in a WebView
