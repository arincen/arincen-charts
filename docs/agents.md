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
| `chart.toContext()` | the same reading as an object, for arithmetic — full build |
| `chart.timeScale().getVisibleRange()` | the period being looked at, as times |
| `chart.timeScale().getVisibleLogicalRange()` | the same, as bar indices |
| `chart.pointer()` | where the reader is pointing, asked at any moment |
| `chart.subscribeCrosshairMove(handler)` | the same thing as an event, as it moves |
| `series.priceToCoordinate(price)` | data space to screen space, when you draw |

**The hand**

| | |
|---|---|
| `chart.annotate(notes)` | markers, levels, regions and trend lines from one shape |
| `notes.remove(id)` | one of them off again, leaving the rest |
| `chart.reset()` | the chart as the reader found it |
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

<ChartDemo :height="300">

```js
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

const readout = ui.readout(chart.toText());

let notes = null;

ui.button('Annotate', () => {
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
});
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

**Or ask about a period the reader is not looking at:**

```js
chart.toText({ from: '2024-03-01', to: '2024-03-31' });
```

*"What happened in March?"* is a question about March, and answering it should
not scroll the chart out from under the person who asked. The view stays where
it is. Bounds land on the nearest readings — a period asked about in whole
months rarely lines up with a trading day — and they may be handed over in
either order, because a model returns them in either order.

Prices come out through your own `priceFormatter`, so a chart labelled in
dollars describes itself in dollars. Extremes are read from highs and lows on a
candlestick — the highest wick, which is the number a reader would give — not
from closes.

**Click twice on the chart to choose a period** — the stretch you picked is
shaded, and the sentence underneath describes exactly it. That is the shape of
the real question: a reader points at the part they mean, and the answer is
about that part.

The buttons are the other three ways to ask. It opens zoomed into the last
stretch, so they genuinely differ: the window says one thing, the whole series
says another, and April 2024 says a third. Drag the chart with **On screen**
chosen and the sentence follows the view; choose any of the others and the view
stays exactly where it is.

<ChartDemo :height="300">

```js
const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
    title: 'ARN',
});

const bars = data.slice(-120);

// A named month, written the way somebody would ask for it. Neither bound is
// a trading day the data happens to hold — they land on the nearest readings.
const month = { from: '2024-04-01', to: '2024-04-30' };

series.setData(bars);

// Deliberately not fitContent: with every bar on screen, "what is on screen"
// and "the whole series" are the same sentence, and a demo where two buttons
// print the same thing teaches nothing.
chart.timeScale().setVisibleLogicalRange({ from: bars.length - 45, to: bars.length - 1 });

const iso = (time) => (typeof time === 'string' ? time : new Date(time * 1000).toISOString().slice(0, 10));

// The period the reader picks by clicking the chart twice.
const picked = { from: null, to: null };

const asked = [
    { label: 'On screen', call: () => 'chart.toText()', run: () => chart.toText() },
    {
        label: 'The whole series',
        call: () => 'chart.toText({ visible: false })',
        run: () => chart.toText({ visible: false }),
    },
    {
        label: 'April 2024',
        call: () => `chart.toText({ from: '${month.from}', to: '${month.to}' })`,
        run: () => chart.toText(month),
    },
    {
        label: 'Two clicks on the chart',
        call: () => (picked.to
            ? `chart.toText({ from: '${iso(picked.from)}', to: '${iso(picked.to)}' })`
            : 'chart.toText({ from, to })'),
        run: () => {
            if (! picked.to) {
                return picked.from
                    ? `Started at ${iso(picked.from)}. Click once more to close the period.`
                    : 'Click twice on the chart to choose a period.';
            }

            return chart.toText({ from: picked.from, to: picked.to });
        },
    },
];

let chosen = 0;

const readout = ui.readout();
const render = () => { readout.textContent = `${asked[chosen].call()}\n\n${asked[chosen].run()}`; };

const choices = ui.options(asked.map((question) => question.label), (index) => {
    chosen = index;
    render();
});

/**
 * Choosing the period on the chart itself, which is how a reader actually asks
 * about one: they point at the stretch they mean. The first click opens it, the
 * second closes it and shades it, and a third starts again.
 */
let shaded = null;

const onClick = (param) => {
    if (param.time === undefined) {
        return;
    }

    if (picked.to || ! picked.from) {
        shaded?.clear();
        shaded = null;
        picked.from = param.time;
        picked.to = null;
    } else {
        picked.to = param.time;
        shaded = chart.annotate([{ from: picked.from, to: picked.to, text: 'the period you chose' }]);
    }

    chosen = asked.length - 1;
    choices.choose(chosen);
    render();
};

chart.subscribeClick(onClick);
onCleanup(() => chart.unsubscribeClick(onClick));

render();
chart.timeScale().subscribeVisibleLogicalRangeChange(render);
onCleanup(() => chart.timeScale().unsubscribeVisibleLogicalRangeChange(render));
```

</ChartDemo>

It is also the plainest accessible summary of a chart there is, which is the
other reason to have it.

## `toContext`

The same reading as an object, for the half of the work that is arithmetic
rather than language. Full build.

```js
chart.toContext();
// {
//     range:  { from: '2024-04-01', to: '2024-06-28', bars: 89, whole: false },
//     data:   { from: '2024-01-01', to: '2024-06-28', bars: 180 },
//     series: [{ title: 'AAPL', type: 'candlestick', visible: true, readings: 89,
//                first: 126.8, last: 142.56,
//                high: { price: 150.10, time: '2024-06-20' },
//                low:  { price: 98.20,  time: '2024-04-03' },
//                changePercent: 12.42 }],
//     pointer: null,
//     drawn:   { markers: 3, priceLines: 1, regions: 0 },
// }
```

**Reach for `toText` first.** A model reasons perfectly well from prose, and
prose costs a fraction of the tokens. This is for a threshold, a table, a second
chart drawn from the same numbers — anywhere parsing English back into floats is
work somebody has already done wrong.

The two cannot disagree: both take their window from the same place and their
figures from the same summary, so the sentence and the object always report the
same high. It takes the same `visible` and `from`/`to` options.

It carries only what the chart genuinely knows. There are no indicators, no
drawings and no selection in this library, and inventing fields for them would
be a promise the rest of the code does not keep.

**Drag the chart and watch the object change.** `range` and every figure under
`series` follow the window you are looking at; `data` stays put, because it
describes everything the chart holds. Hover it and `pointer` fills in.

Times come back in the form your data used — these readings carry unix seconds,
so that is what you see. `toText` formats dates for reading; this hands back what
you gave it, so it can go straight into `annotate` or `setVisibleRange`.

<ChartDemo :height="300">

```js
chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2, title: 'ARN' })
    .setData(data.slice(-60));
chart.timeScale().fitContent();

const readout = ui.readout();

// The whole object, on every change, so nothing is hidden behind a summary of
// it. A window is what this call is about — if it did not follow the view
// there would be no reason to prefer it to reading the data you already have.
const show = () => { readout.textContent = JSON.stringify(chart.toContext(), null, 1); };
const timer = setInterval(show, 200);

show();
onCleanup(() => clearInterval(timer));
```

</ChartDemo>

## `annotate`

```js
const notes = chart.annotate([
    { time, price, text },                                 // a point   -> a marker
    { price, text },                                       // a level   -> a price line
    { from, to, text },                                    // a region  -> a shaded band
    { from: { time, price }, to: { time, price }, text },   // a trend line
], { series });                                            // whose series; the first with data by default

notes.clear();
```

One shape in, whatever it means. Doing this by hand means knowing that those
four land on four unrelated APIs, two of which you have to write yourself.

**A trend line is two ends that carry a price.** *"From this low to that low"*
is a line; *"from March to April"* is a stretch of time. The same two words
mean both, and which one you get is decided by whether the ends know a price —
so nothing has to be named or switched on.

| | |
|---|---|
| `color` | one colour per note; the band fill is derived from it at 10% |
| a reversed `from`/`to` | drawn the same either way — a model returns them in either order |
| a note with neither `price` nor a range | ignored, rather than guessed at |
| markers you drew yourself | untouched; `annotate` appends, and `clear()` takes back only its own |
| a label that would run off the edge | moved left until it fits, rather than clipped mid-word |

### Taking one back

```js
const notes = chart.annotate([
    { id: 'resistance', price: 148, text: 'resistance' },
    { time, price, text: 'breakout' },
]);

notes.remove('resistance');   // true; the breakout marker stays
notes.ids;                    // ['resistance', 'note-2']
```

*"No, drop the resistance line"* is an ordinary second sentence, and clearing
everything to redraw all but one of them is not an answer to it. Notes carry
the `id` you gave them, or one the chart gives them.

And when a conversation has left the chart somewhere strange:

```js
chart.reset();
```

Every annotation from every call comes off — no need to have kept each handle —
and the view refits. Markers the page drew itself are left alone, because they
were never `annotate`'s to remove.

### What a model actually sends

The shapes above are what you would write. These are what comes back at three in
the morning, and all of them are read rather than refused:

| | |
|---|---|
| ` ```json … ``` ` | the fence is stripped and the JSON parsed |
| one object, not an array | wrapped |
| `{ notes: [...] }` | unwrapped — it is what the tool's own parameter was called |
| `label`, `title`, `name` | read as `text` |
| `value`, `level` | read as `price` |
| `start`, `end` | read as `from`, `to` |
| `"142.56"` | read as a number |
| a sentence that is not JSON | nothing is drawn, and it says so |

Each repair is reported once, with a tally, through the same `onError` channel
as everything else — repaired quietly is how a prompt stays broken for a month.

<ChartDemo :height="300">

```js

const series = chart.addSeries(CandlestickSeries, {
    upColor: '#22ab94',
    downColor: '#f23645',
    borderUpColor: '#22ab94',
    borderDownColor: '#f23645',
    wickUpColor: '#22ab94',
    wickDownColor: '#f23645',
    title: 'ARN',
});

const bars = data.slice(-70);

series.setData(bars);
chart.timeScale().fitContent();

const lowest = (from, to) => bars.slice(from, to).reduce((least, bar) => (bar.low < least.low ? bar : least), bars[from]);
const high = bars.reduce((most, bar) => (bar.high > most.high ? bar : most), bars[0]);

// Two lows to run a line between, which is what a support line is. One point
// and a guess is not a trend line.
const first = lowest(0, 20);
const second = lowest(25, 50);

let notes = null;

// One answer, in all four shapes. Each gets its own colour, because four notes
// in one pink are a decoration rather than four separate things somebody said.
ui.button('Draw the answer', () => {
    notes?.clear();
    notes = chart.annotate([
        {
            from: { time: first.time, price: first.low },
            to: { time: second.time, price: second.low },
            text: 'support',
            color: '#22ab94',
        },
        { id: 'resistance', price: high.high, text: 'resistance', color: '#f23645' },
        { time: high.time, price: high.high, text: 'high', color: '#8b5cf6' },
        { from: first.time, to: second.time, text: 'the base', color: '#0ea5e9' },
    ]);
});

ui.button('Remove the resistance', () => notes?.remove('resistance'));
ui.button('Reset the chart', () => {
    chart.reset();
    notes = null;
});
```

</ChartDemo>

**Nothing here interprets anything.** It is a drawing call whose input happens
to be easy for a model to produce.

## `pointer`

Where the reader is pointing, asked whenever you need it.

```js
chart.pointer();
// null, or:
// {
//     time: '2024-06-20',            price: 148.31,
//     logical: 122,                  point: { x: 412, y: 96 },
//     seriesData: Map { AAPL => { time, open, high, low, close } },
//     hoveredSeries, hoveredObjectId,
// }
```

`subscribeCrosshairMove` is the right shape for a tooltip, which has to react
the instant the pointer moves. It is the wrong shape for anything that arrives
afterwards — *"what is this candle?"* is asked about a position the pointer
reached a second ago, and an answer needs the state, not the event. Without
this, every caller keeps its own copy of the last event in a variable, which is
the same three lines written in every project.

It is `null` when the pointer is not over the plot. That is an answer — nobody
is pointing at anything — and worth passing on rather than treating as a
failure.

The price is read from the scale the crosshair is on, so a series on a second
scale reports its own number rather than a plausible one off the wrong axis.

**Move the pointer over the chart.** Nothing below is subscribed to anything —
a timer asks `chart.pointer()` five times a second and prints whatever comes
back, which is exactly the shape of an agent asking after the fact. Move the
pointer away and it answers `null`, because nobody is pointing at anything.

<ChartDemo :height="300">

```js
const series = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2, title: 'ARN' });

series.setData(data.slice(-60));
chart.timeScale().fitContent();

const readout = ui.readout();

// No handler is registered. This asks the question, which is the difference
// between `pointer()` and `subscribeCrosshairMove` — and the reason a caller
// that arrives late can still find out where the reader is looking.
const ask = () => {
    const at = chart.pointer();

    readout.textContent = at
        ? `chart.pointer()\n\n  time    ${at.time}\n  price   ${at.price.toFixed(2)}`
            + `\n  bar     ${at.logical}\n  value   ${at.seriesData.get(series)?.value ?? '—'}`
        : 'chart.pointer()\n\n  null — the pointer is not over the chart';
};

const timer = setInterval(ask, 200);

ask();
onCleanup(() => clearInterval(timer));
```

</ChartDemo>

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
    "name": "read_pointer",
    "description": "What the reader is pointing at right now: the time, the price and the reading under the pointer. Returns nothing when the pointer is not over the chart. Call this when the user says 'this candle' or 'here'.",
    "input_schema": { "type": "object", "properties": {} }
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
    read_chart: ({ visible = true, from, to }) => chart.toText({ visible, from, to }),
    read_pointer: () => {
        const at = chart.pointer();

        return at ? `${at.time} at ${at.price.toFixed(2)}` : 'nothing under the pointer';
    },
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
