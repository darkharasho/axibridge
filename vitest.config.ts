import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
    // Limit parallelism to avoid exhausting system memory
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2, minForks: 1 },
    },
    maxWorkers: 2,
    minWorkers: 1,
        environment: 'jsdom',
        setupFiles: ['src/renderer/test/setup.ts'],
        css: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['node_modules/**', 'tests/**', 'dist/**', 'dist-*', 'dist_*', 'web/**']
    }
});
