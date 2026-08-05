import { defineConfig } from 'vite';

/** Script-tag build, full. */
export default defineConfig({
    define: { __ARINCEN_CHARTS_FULL__: true },
    build: {
        lib: {
            entry: 'src/standalone-full.js',
            name: 'ArincenChartsFull',
            formats: ['iife'],
            fileName: () => 'arincen-charts-full.standalone.js',
        },
        outDir: 'dist',
        emptyOutDir: false,
        minify: true,
        sourcemap: false,
    },
});
