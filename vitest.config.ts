import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts'],
        },
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
});
