import { writeFileSync } from 'node:fs';

/**
 * The documentation lives at /charts so the subdomain can hold more than one
 * project later. Someone who types the bare domain should still arrive
 * somewhere, so the root forwards rather than showing an empty directory.
 *
 * Written after the build because VitePress puts its output inside
 * `dist/charts`, and this file has to sit beside that folder rather than in it.
 */
writeFileSync('.vitepress/dist/_redirects', '/  /charts/  302\n');
