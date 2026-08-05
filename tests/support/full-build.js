/**
 * Turns the build flag on for whichever test file imports this first.
 *
 * The engine reads `__ARINCEN_CHARTS_FULL__`, which Vite replaces with a
 * literal at build time and which is simply absent under the test runner —
 * leaving the light build, where the logarithmic and percentage code has been
 * deleted. Defining it on the global before `flags.js` is evaluated is what
 * lets the full-build behaviour be tested at all.
 *
 * Import order matters: ES modules are evaluated in the order they are
 * imported, so this has to come above anything that reaches the engine. The
 * test runner gives each file its own process, so a file that imports this
 * cannot leak the flag into one that does not.
 */
globalThis.__ARINCEN_CHARTS_FULL__ = true;
