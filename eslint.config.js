// ESLint 9 flat config. Replaces .eslintrc.cjs, which ESLint 9 no longer reads
// and which referenced a parser that was never installed - so `npm run lint`
// had been silently failing.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'future/**', 'site/**', '*.config.js'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                chrome: 'readonly',
                document: 'readonly',
                window: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                Blob: 'readonly',
                atob: 'readonly',
                btoa: 'readonly',
                fetch: 'readonly',
                HTMLElement: 'readonly',
                HTMLImageElement: 'readonly',
                HTMLAnchorElement: 'readonly',
                HTMLInputElement: 'readonly',
                Uint8Array: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
        },
    }
);
