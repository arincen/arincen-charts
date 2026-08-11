import { writeFileSync } from 'node:fs';

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
