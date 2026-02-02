import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['src/renderer/test/setup.ts'],
        css: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['node_modules/**', 'tests/**', 'dist/**', 'dist-*', 'dist_*', 'web/**']
    }
});
