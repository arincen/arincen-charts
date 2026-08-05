import { defineConfig } from 'vitepress';

/**
 * The docs site, served from docs.arincen.com/charts.
 *
 * The base path is deliberate rather than incidental: the subdomain is meant to
 * hold more than this one library eventually, so the library lives in a folder
 * from the first day. Putting it at the root and moving it later would break
 * links in other people's writing, which is the one kind of link you cannot go
 * back and fix.
 */
export default defineConfig({
    base: '/charts/',

    // Built into a `charts` folder rather than the root of dist. Cloudflare
    // Pages serves the output directory at the domain root, so a base path
    // alone would rewrite every URL to /charts/ while the files sat one level
    // above it — every asset a 404, and the router falling through to the
    // not-found page.
    outDir: '.vitepress/dist/charts',
    lang: 'en-US',
    title: 'Arincen Charts',
    description: 'A financial chart in about 14 KB, with zero dependencies.',
    cleanUrls: true,
    lastUpdated: true,

    head: [
        ['link', { rel: 'icon', href: '/charts/favicon.svg' }],
        ['meta', { name: 'theme-color', content: '#2962ff' }],
    ],

    themeConfig: {
        siteTitle: 'Arincen Charts',

        nav: [
            { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
            { text: 'API', link: '/api/', activeMatch: '/api/' },
            { text: 'Overview', link: 'https://en.arincen.com/charts' },
        ],

        sidebar: [
            {
                text: 'Guide',
                items: [
                    { text: 'Getting started', link: '/guide/' },
                    { text: 'Two builds', link: '/guide/two-builds' },
                    { text: 'Series', link: '/guide/series' },
                    { text: 'Price scales', link: '/guide/price-scales' },
                    { text: 'Panes', link: '/guide/panes' },
                ],
            },
            {
                text: 'Extending',
                items: [
                    { text: 'Primitives', link: '/guide/primitives' },
                    { text: 'Custom series', link: '/guide/custom-series' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'API', link: '/api/' },
                    { text: 'Coming from lightweight-charts', link: '/guide/migrating' },
                    { text: 'Attribution and licence', link: '/attribution' },
                ],
            },
        ],

        socialLinks: [
            { icon: 'github', link: 'https://github.com/arincen/arincen-charts' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/@arincen/charts' },
        ],

        search: { provider: 'local' },

        editLink: {
            pattern: 'https://github.com/arincen/arincen-charts/edit/main/docs/:path',
            text: 'Suggest a change to this page',
        },

        footer: {
            message: 'Released under the MIT licence. Lightweight Charts™ is a trademark of TradingView, Inc. '
                + 'This project is not affiliated with or endorsed by TradingView.',
            copyright: 'Copyright © 2026 Arincen L.L.C-FZ',
        },
    },
});
