import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['public/js/**/*.js'],
            exclude: ['public/js/firebase-config.js', '**/*.test.js'],
        },
    },
});
