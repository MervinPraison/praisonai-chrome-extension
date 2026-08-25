import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                background: resolve(__dirname, 'src/background/index.ts'),
                sidepanel: resolve(__dirname, 'src/sidepanel/index.ts'),
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
            '@cdp': resolve(__dirname, 'src/cdp'),
        },
    },
    plugins: [
        viteStaticCopy({
            targets: [
                { src: 'manifest.json', dest: '.' },
                { src: 'src/sidepanel/sidepanel.html', dest: '.' },
                { src: 'icons/*', dest: 'icons' },
                { src: 'src/sidepanel/styles.css', dest: '.' },
            ],
        }),
    ],
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    },
});
