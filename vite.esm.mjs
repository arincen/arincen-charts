import { defineConfig } from 'vite';

/** ESM build. The flag is baked per entry, so each is built separately. */
const full = process.env.ARINCEN_CHARTS_FULL === 'true';

export default defineConfig({
    define: { __ARINCEN_CHARTS_FULL__: full ? 'true' : 'false' },
    build: {
        lib: {
            entry: full ? 'src/full.js' : 'src/index.js',
            formats: ['es'],
            fileName: () => (full ? 'full.mjs' : 'index.mjs'),
        },
        outDir: 'dist',
        emptyOutDir: false,
        minify: false,
        sourcemap: true,
    },
});
