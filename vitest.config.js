import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['public/js/__tests__/**/*.test.js'],
        exclude: [
            'node_modules/**',
            'functions/**',
            'android/**',
            'ios/**'
        ],
        fileParallelism: false
    }
});
