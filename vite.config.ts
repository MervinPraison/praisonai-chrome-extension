import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyDirBeforeWrite: true,
        rollupOptions: {
            input: {
                background: resolve(__dirname, 'src/background/index.ts'),
                content: resolve(__dirname, 'src/content/index.ts'),
                sidepanel: resolve(__dirname, 'src/sidepanel/index.ts'),
                offscreen: resolve(__dirname, 'src/offscreen/index.ts'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
            },
        },
        sourcemap: process.env.NODE_ENV === 'development',
        minify: process.env.NODE_ENV === 'production',
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@core': resolve(__dirname, 'src/core'),
            '@cdp': resolve(__dirname, 'src/cdp'),
            '@ai': resolve(__dirname, 'src/ai'),
            '@ui': resolve(__dirname, 'src/ui'),
        },
    },
    plugins: [
        viteStaticCopy({
            targets: [
                { src: 'manifest.json', dest: '.' },
                { src: 'src/sidepanel/sidepanel.html', dest: '.' },
                { src: 'src/offscreen/offscreen.html', dest: '.' },
                { src: 'icons/*', dest: 'icons' },
                { src: 'src/sidepanel/styles.css', dest: '.' },
            ],
        }),
    ],
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    },
});
