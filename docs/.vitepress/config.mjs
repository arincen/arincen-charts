import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';

/**
 * The docs site, served from docs.arincen.com/charts.
 *
 * The base path is deliberate rather than incidental: the subdomain is meant to
 * hold more than this one library eventually, so the library lives in a folder
 * from the first day. Putting it at the root and moving it later would break
 * links in other people's writing, which is the one kind of link you cannot go
 * back and fix.
 *
 * Sizes are written as "about twenty-six kilobytes" in prose and never as a
 * precise figure. The precise figure belongs on the landing page, which reads
 * it from the shipped file at request time; a number typed into a markdown file
 * is a number that starts drifting the day after it is typed, and the first
 * version of these docs drifted four kilobytes before anyone noticed.
 */
export default defineConfig({
    base: '/charts/',

    // The examples on these pages run against the engine's own source, not a
    // published copy of it. A documentation site that demonstrates last
    // release's behaviour is a documentation site that lies slowly.
    vite: {
        resolve: {
            alias: {
                '@arincen/charts/full': fileURLToPath(
                    new URL('../../src/full.js', import.meta.url),
                ),
                '@arincen/charts': fileURLToPath(
                    new URL('../../src/index.js', import.meta.url),
                ),
            },
        },
        define: {
            __ARINCEN_CHARTS_FULL__: 'true',
        },
    },

    // Built into a `charts` folder rather than the root of dist. Cloudflare
    // Pages serves the output directory at the domain root, so a base path
    // alone would rewrite every URL to /charts/ while the files sat one level
    // above it — every asset a 404, and the router falling through to the
    // not-found page.
    outDir: '.vitepress/dist/charts',
    lang: 'en-US',
    title: 'Arincen Charts',
    description: 'The charting library an AI agent can read. Lighter, faster, smarter: about 26 KB, zero dependencies.',
    cleanUrls: true,
    lastUpdated: true,

    // The site's own favicon files, copied rather than redrawn. A second mark
    // that merely resembles the first is how a brand ends up with two.
    head: [
        ['link', { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/charts/favicon/favicon-96x96.png' }],
        ['link', { rel: 'icon', type: 'image/svg+xml', href: '/charts/favicon/favicon.svg' }],
        ['link', { rel: 'shortcut icon', href: '/charts/favicon/favicon.ico' }],
        ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/charts/favicon/apple-touch-icon.png' }],
        ['meta', { name: 'theme-color', content: '#000000' }],
    ],

    themeConfig: {
        // The wordmark already says "arincen", so the title beside it is the
        // half of the name the logo does not carry. Spelling it out twice is
        // how a nav bar ends up reading "arincen Arincen Charts".
        logo: { light: '/logo-dark.svg', dark: '/logo-light.svg', alt: 'Arincen' },
        siteTitle: 'Charts',

        nav: [
            { text: 'Start', link: '/start/', activeMatch: '/start/' },
            { text: 'Agents', link: '/agents', activeMatch: '/agents' },
            { text: 'Guides', link: '/guide/series', activeMatch: '/guide/' },
            { text: 'Frameworks', link: '/frameworks/react', activeMatch: '/frameworks/' },
            { text: 'Plugins', link: '/plugins/', activeMatch: '/plugins/' },
            { text: 'Recipes', link: '/recipes/', activeMatch: '/recipes/' },
            { text: 'API', link: '/api/', activeMatch: '/api/' },
        ],

        sidebar: [
            {
                text: 'Start',
                items: [
                    { text: 'Install', link: '/start/' },
                    { text: 'Your first chart', link: '/start/first-chart' },
                    { text: 'Choosing a series', link: '/start/choosing-a-series' },
                    { text: 'Live data', link: '/start/live-data' },
                ],
            },
            {
                // Four of them rather than one. Every charting library worth
                // moving from has its own vocabulary, and a reader arriving
                // from Chart.js should not have to read a page about somebody
                // else's API to find out whether the data shape fits.
                text: 'Coming from',
                items: [
                    { text: 'lightweight-charts', link: '/start/migrating' },
                    { text: 'Chart.js', link: '/start/from-chartjs' },
                    { text: 'ApexCharts', link: '/start/from-apexcharts' },
                    { text: 'Highcharts Stock', link: '/start/from-highcharts' },
                ],
            },
            {
                // Its own section, second, rather than the last line of
                // Recipes. It is the reason to choose this library over any
                // other, and a reader should not have to go looking for it.
                text: 'Agents',
                items: [
                    { text: 'An agent\'s eye and hand', link: '/agents' },
                ],
            },
            {
                text: 'Guides',
                items: [
                    { text: 'Series', link: '/guide/series' },
                    { text: 'Price scales', link: '/guide/price-scales' },
                    { text: 'The time scale', link: '/guide/time-scale' },
                    { text: 'Crosshair and interaction', link: '/guide/interaction' },
                    { text: 'Markers and price lines', link: '/guide/markers' },
                    { text: 'Panes', link: '/guide/panes' },
                    { text: 'Watermarks and up/down markers', link: '/guide/watermarks' },
                    { text: 'Localization and typography', link: '/guide/localization' },
                    { text: 'The two builds', link: '/guide/two-builds' },
                    { text: 'Large datasets', link: '/guide/performance' },
                ],
            },
            {
                text: 'Frameworks',
                items: [
                    { text: 'React', link: '/frameworks/react' },
                    { text: 'Vue', link: '/frameworks/vue' },
                    { text: 'Svelte', link: '/frameworks/svelte' },
                    { text: 'In a mobile app', link: '/frameworks/mobile' },
                    { text: 'No build step', link: '/frameworks/script-tag' },
                ],
            },
            {
                text: 'Plugins',
                items: [
                    { text: 'What a plugin is', link: '/plugins/' },
                    { text: 'Your first primitive', link: '/plugins/first-primitive' },
                    { text: 'Drawing on the axes', link: '/plugins/axes' },
                    { text: 'Hit testing and dragging', link: '/plugins/hit-testing' },
                    { text: 'Custom series', link: '/plugins/custom-series' },
                    { text: 'Seven things that will catch you', link: '/plugins/traps' },
                ],
            },
            {
                text: 'Recipes',
                items: [
                    { text: 'Overview', link: '/recipes/' },
                    { text: 'Synchronised charts', link: '/recipes/synced-charts' },
                    { text: 'Load history on scroll', link: '/recipes/infinite-history' },
                    { text: 'A live streaming chart', link: '/recipes/streaming' },
                    { text: 'A sparkline', link: '/recipes/sparkline' },
                    { text: 'Downloading the chart', link: '/recipes/export' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    { text: 'API', link: '/api/' },
                    { text: 'Chart options', link: '/api/chart-options' },
                    { text: 'Series options', link: '/api/series-options' },
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

        // The trademark notice is not here.
        //
        // It is required, and it is carried in the three places it belongs:
        // the package's NOTICE file, /attribution, and the migration page —
        // every page that names TradingView, plus the file a licence audit
        // reads. In the global footer it also appeared on the twenty-five
        // pages that never mention them, which met no obligation and printed a
        // competitor's brand on every page of our own documentation.
        footer: {
            message: 'Released under the MIT licence.',
            copyright: 'Copyright © 2026 Arincen L.L.C-FZ',
        },
    },
});
