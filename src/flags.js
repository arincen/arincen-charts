/**
 * Build-time feature flags.
 *
 * Anything structural — code that lives in the core rather than in a module a
 * caller opts into — cannot be tree-shaken out, because the core always
 * references it. Panes are the clearest case: making the layout pane-aware
 * touches rendering, hit-testing and the crosshair, so a bundler has no way to
 * prove a single-pane page never needs it.
 *
 * So the split is made at build time instead. The bundler replaces
 * `__ARINCEN_CHARTS_FULL__` with a literal, the branch folds to a constant, and
 * the minifier deletes the dead side outright — the light build ships zero
 * bytes of it, not "tree-shaken, mostly".
 *
 * The `typeof` guard means the flag is optional: anywhere it is undefined —
 * a plain test runner, a consumer bundling from source — the light build is
 * what you get.
 */
export const FULL_BUILD = typeof __ARINCEN_CHARTS_FULL__ !== 'undefined'
    ? __ARINCEN_CHARTS_FULL__
    : false;
