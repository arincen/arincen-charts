# An agent's eye and hand on the chart

Three calls, in both builds. The chart says what it is showing, hands over a
picture, and draws back whatever comes back.

```js
chart.toText();      // what is on screen, in words
chart.toImage();     // the same thing as a PNG, for a vision model
chart.annotate([]);  // what the model said, back on the chart
```

There is no model here, no API key and no client library. A charting library
that bundles one has decided which provider you use and dates the moment that
provider changes its API. What is missing everywhere else is the boring half —
getting the numbers *out* in a form something can reason about, and getting an
answer *back* onto the canvas — and that is what these are.

## What the agent can see, and what it can do

Both halves are ordinary public API. Nothing on this page is an "AI mode" — an
agent is simply the first caller that needed all of it named in one place.

**The eye**

| | |
|---|---|
| `chart.toText()` | what is on screen, as sentences |
| `chart.toImage()` | the same view as a PNG, for a vision model |
| `chart.timeScale().getVisibleRange()` | the period being looked at, as times |
| `chart.timeScale().getVisibleLogicalRange()` | the same, as bar indices |
| `chart.subscribeCrosshairMove(handler)` | where the pointer is, as it moves |
| `series.priceToCoordinate(price)` | data space to screen space, when you draw |

**The hand**

| | |
|---|---|
| `chart.annotate(notes)` | markers, levels and regions from one shape |
| `chart.timeScale().setVisibleRange({ from, to })` | look at this period |
| `chart.timeScale().fitContent()` | look at everything |
| `chart.setCrosshairPosition(price, time, series)` | point at this |
| `series.applyOptions({ visible: false })` | hide a series |
| `chart.removeSeries(series)` | drop one |

The loop worth building is the two halves together: read the window, decide,
draw the answer on it. A user who asks *"what happened in this spike?"* has
already told you the period by zooming to it — `getVisibleRange()` is the
question, and `annotate()` is the answer.

## The loop

```js
const answer = await ask(`
    ${chart.toText()}

    Name up to three periods worth a second look. Reply as JSON:
    [{ "from": <unix seconds>, "to": <unix seconds>, "text": "<six words>" }]
`);

chart.annotate(JSON.parse(answer));
```

Press the button below. There is no model behind it — it marks the largest
move it can find, which is what a real answer would look like coming back.

<ChartDemo :height="420">

```js
// The chart keeps the top; the description gets its own panel underneath
// rather than being written over the axis it is describing.
chart.applyOptions({ autoSize: false, width: container.offsetWidth, height: 300 });

const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
    title: 'ARN',
});

const bars = data.slice(-90);

series.setData(bars);
chart.timeScale().fitContent();

const readout = document.createElement('pre');

readout.style.cssText = 'position:absolute;top:308px;left:0;right:0;bottom:0;z-index:3;margin:0;'
    + 'overflow:auto;padding:10px 12px;border-top:1px solid rgba(127,127,127,0.25);'
    + 'font:500 10px ui-monospace,monospace;white-space:pre-wrap;opacity:0.75';
readout.textContent = chart.toText();
container.appendChild(readout);

const button = document.createElement('button');

button.textContent = 'Annotate';
button.style.cssText = 'position:absolute;top:10px;left:12px;z-index:3;font:600 12px system-ui;'
    + 'padding:4px 12px;border-radius:999px;border:1px solid #db2777;color:#db2777;'
    + 'background:transparent;cursor:pointer';
container.appendChild(button);

let notes = null;

button.onclick = () => {
    notes?.clear();

    // Stand-in for the model: the steepest ten-bar stretch, and the highest
    // close. A real answer arrives in exactly this shape.
    let best = { gain: -Infinity, at: 0 };

    for (let index = 10; index < bars.length; index++) {
        const gain = bars[index].close - bars[index - 10].close;

        if (gain > best.gain) {
            best = { gain, at: index };
        }
    }

    const peak = bars.reduce((top, bar) => (bar.close > top.close ? bar : top), bars[0]);

    notes = chart.annotate([
        { from: bars[best.at - 10].time, to: bars[best.at].time, text: 'steepest run' },
        { time: peak.time, price: peak.high, text: 'high' },
        { price: peak.close, text: 'peak close' },
    ]);

    readout.textContent = chart.toText();
};
```

</ChartDemo>

## `toText`

```js
chart.toText({ visible: true });   // the default: only what is on screen
```

```
A chart of 2 series over 180 readings, 2024-01-01 to 2024-06-28.
Showing 2024-04-01 to 2024-06-28, 89 of them.
AAPL (candlestick): last 142.56, high 150.10 on 2024-06-20, low 98.20 on 2024-04-03, up 12.42% over the period.
MA20 (line): last 139.90, high 148.02 on 2024-06-21, low 99.40 on 2024-04-04, up 11.80% over the period.
3 markers, 1 price line.
```

**It states and does not interpret.** No "bullish", no "resistance", no trend
call. Those are conclusions somebody with money at stake gets to draw, and a
library that draws them has taken a position on it. A test fails the build if
any of those words appear.

**It describes the window, and says that it is doing so.** A model told
*"high 150"* about a chart holding five years will say something wrong about the
other four. Pass `{ visible: false }` for the whole series.

Prices come out through your own `priceFormatter`, so a chart labelled in
dollars describes itself in dollars. Extremes are read from highs and lows on a
candlestick — the highest wick, which is the number a reader would give — not
from closes.

It is also the plainest accessible summary of a chart there is, which is the
other reason to have it.

## `annotate`

```js
const notes = chart.annotate([
    { time, price, text },   // a point       -> a marker
    { price, text },         // a level       -> a price line
    { from, to, text },      // a region      -> a shaded band
], { series });              // whose series; the first with data by default

notes.clear();
```

One shape in, whatever it means. Doing this by hand means knowing that those
three land on three unrelated APIs, one of which you have to write yourself.

| | |
|---|---|
| `color` | one colour per note; the band fill is derived from it at 10% |
| a reversed `from`/`to` | drawn the same either way — a model returns them in either order |
| a note with neither `price` nor a range | ignored, rather than guessed at |
| markers you drew yourself | untouched; `annotate` appends, and `clear()` takes back only its own |

**Nothing here interprets anything.** It is a drawing call whose input happens
to be easy for a model to produce.

## Sending the picture instead

For a vision model, [`toImage`](/recipes/export) gives you the PNG:

```js
await ask({
    text: 'What happened here?',
    image: chart.toImage({ background: '#ffffff' }),
});
```

Text costs a fraction of what an image costs and carries the exact numbers, so
`toText` is the one to reach for first. The picture is worth sending when the
question is about shape.

## Tool definitions, ready to paste

An agent cannot call what it has not been handed. These are the chart's verbs
in tool-definition form — the shape Claude and the OpenAI models both take,
give or take the wrapper key. Nothing here is generated at runtime or shipped
in the bundle; it is a description of the API above, and it costs no bytes.

```json
[
  {
    "name": "read_chart",
    "description": "Read what is currently on screen: the period, each series, its last value, high, low and change over the visible window. Call this before answering anything about the chart.",
    "input_schema": {
      "type": "object",
      "properties": {
        "visible": {
          "type": "boolean",
          "description": "true (default) describes only what is on screen; false describes the whole dataset."
        }
      }
    }
  },
  {
    "name": "set_visible_range",
    "description": "Move the view to a period. Use it to look closer at something the user asked about.",
    "input_schema": {
      "type": "object",
      "properties": {
        "from": { "type": "string", "description": "Start, as YYYY-MM-DD or unix seconds." },
        "to": { "type": "string", "description": "End, as YYYY-MM-DD or unix seconds." }
      },
      "required": ["from", "to"]
    }
  },
  {
    "name": "annotate_chart",
    "description": "Draw findings onto the chart. A note with time and price becomes a marker, one with price alone becomes a level across the chart, and one with from and to becomes a shaded region.",
    "input_schema": {
      "type": "object",
      "properties": {
        "notes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "time": { "type": "string" },
              "price": { "type": "number" },
              "from": { "type": "string" },
              "to": { "type": "string" },
              "text": { "type": "string", "description": "Six words at most; it is drawn on the chart." },
              "color": { "type": "string" }
            },
            "required": ["text"]
          }
        }
      },
      "required": ["notes"]
    }
  },
  {
    "name": "clear_annotations",
    "description": "Remove the notes drawn by the last annotate_chart call. Markers the page drew itself are left alone.",
    "input_schema": { "type": "object", "properties": {} }
  }
]
```

Wiring them to the chart is the boring part, and it is this short:

```js
const tools = {
    read_chart: ({ visible = true }) => chart.toText({ visible }),
    set_visible_range: ({ from, to }) => chart.timeScale().setVisibleRange({ from, to }),
    annotate_chart: ({ notes }) => {
        drawn?.clear();
        drawn = chart.annotate(notes);

        return `${notes.length} drawn`;
    },
    clear_annotations: () => {
        drawn?.clear();
        drawn = null;

        return 'cleared';
    },
};

const run = (call) => tools[call.name](call.input ?? {});
```

Every tool returns a string, because what the model needs back is confirmation
in the same language it asked in — and `read_chart` returning `toText()` means
the model sees the result of its own zoom.

## Adding your own tools

The chart is one surface and your application is another. Switching timeframe
is not a chart call — it means fetching different data — and neither is looking
something up. Register those beside the chart's own, so the agent sees one set
of verbs rather than two systems:

```js
const tools = {
    ...chartTools,

    change_timeframe: async ({ timeframe }) => {
        series.setData(await fetchBars(symbol, timeframe));
        chart.timeScale().fitContent();

        return chart.toText();
    },

    search_news: ({ from, to }) => yourNewsApi.between(from, to),
};
```

That is the whole pattern behind *"what happened in this spike?"* — the agent
reads the window, searches your own data for those dates, answers in words, and
draws what it found back onto the chart. The library supplies the eye and the
hand; the knowledge stays yours.

## What next

- [Downloading the chart](/recipes/export) — the same PNG, for people
- [Markers and price lines](/guide/markers) — what `annotate` draws with
