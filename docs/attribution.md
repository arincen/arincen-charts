# Attribution and licence

## Licence

MIT. The full text is in [LICENSE](https://github.com/arincen/arincen-charts/blob/main/LICENSE).

Plain, unmodified MIT — no added clauses. Automated licence scanners match it,
and it passes review without anyone having to read anything.

## Attribution

The library shows a small **Arincen Charts** link in the corner of the chart,
on by default. It is a real anchor element rather than something painted on the
canvas, because a canvas cannot hold a link.

To remove it:

```js
createChart(container, { layout: { attributionLogo: false } });
```

That is a supported option and always will be.

### Why it is a request rather than a condition

Because a condition nobody enforces only costs.

We considered putting an attribution clause in the licence and decided against
it: a modified MIT is no longer plain MIT, which means the package declares
`SEE LICENSE IN LICENSE` and routes through manual legal review at many
companies. That is a real tax on adoption, in exchange for a term we were never
going to pursue anyone over.

We also considered asking for a follow link. We decided against that too.
Google's link spam guidance names widget-distributed links as a scheme, and a
link required as a condition of use is by definition not editorial — so it
would likely be discounted, occasionally counted against the sites carrying it,
and would cost adoption on the way.

So: keep the mark if it costs you nothing, or credit "Arincen Charts" near the
chart, or do neither. If Arincen Charts renders something you have shipped,
[tell us](https://github.com/arincen/arincen-charts/issues) and we will list it.

## Trademarks

Lightweight Charts™ is a trademark of TradingView, Inc. This project is not
affiliated with, endorsed by, or sponsored by TradingView.

Parts of this library's API surface, and some rendering constants governing
candle widths and axis tick spacing, are modelled on lightweight-charts, which
is distributed by TradingView, Inc. under the Apache License 2.0. That licence
grants no trademark rights, and none are claimed here.
