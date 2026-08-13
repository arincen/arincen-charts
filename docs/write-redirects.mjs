import { copyFileSync, writeFileSync } from 'node:fs';

/**
 * The documentation lives at /charts so the subdomain can hold more than one
 * project later. Someone who types the bare domain should still arrive
 * somewhere, so the root forwards rather than showing an empty directory.
 *
 * Written after the build because VitePress puts its output inside
 * `dist/charts`, and this file has to sit beside that folder rather than in it.
 */

/**
 * The agent page moved out of `/recipes/ai` and up to `/agents` when it stopped
 * being one recipe among seven and became the reason to choose this library.
 * The old path is in READMEs already published to npm, and a published tarball
 * cannot be edited — so the redirect is permanent, and stays.
 */
writeFileSync(
    '.vitepress/dist/_redirects',
    '/  /charts/  302\n'
    + '/charts/recipes/ai  /charts/agents  301\n',
);

/**
 * The favicon, at the root of the host as well as inside `/charts`.
 *
 * Google supports one favicon per *host*, and finds it either from a
 * `<link rel="icon">` on the host's home page or at `/favicon.ico`. Ours had
 * neither: the home page is the 302 above, so there is no HTML at the root for
 * a crawler to read the tag from, and `/favicon.ico` was a 404. The result is
 * the grey globe beside our results in Google rather than the mark, which is
 * the first thing anybody sees of this project in a search page.
 *
 * The tags inside `/charts` are correct and stay — they are what a browser tab
 * uses. This is for the crawler that never gets that far.
 */
for (const [from, to] of [
    ['public/favicon/favicon.ico', '.vitepress/dist/favicon.ico'],
    ['public/favicon/favicon.svg', '.vitepress/dist/favicon.svg'],
    ['public/favicon/favicon-96x96.png', '.vitepress/dist/favicon-96x96.png'],
    ['public/favicon/apple-touch-icon.png', '.vitepress/dist/apple-touch-icon.png'],
]) {
    copyFileSync(from, to);
}
