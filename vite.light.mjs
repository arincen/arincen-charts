import { defineConfig } from 'vite';

/** Script-tag build, light. */
export default defineConfig({
    define: { __ARINCEN_CHARTS_FULL__: false },
    build: {
        lib: {
            entry: 'src/standalone.js',
            name: 'ArincenCharts',
            formats: ['iife'],
            fileName: () => 'arincen-charts.standalone.js',
        },
        outDir: 'dist',
        emptyOutDir: false,
        minify: true,
        sourcemap: false,
    },
});
