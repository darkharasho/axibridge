import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
    // Limit parallelism to avoid exhausting system memory.
    // Vitest 4 removed `test.poolOptions` — the per-pool `maxForks`/`minForks`
    // knobs are now the top-level `maxWorkers`/`minWorkers` below, which apply
    // to whichever pool is selected. See
    // https://vitest.dev/guide/migration#pool-rework
    pool: 'forks',
    maxWorkers: 2,
    minWorkers: 1,
        environment: 'jsdom',
        setupFiles: ['src/renderer/test/setup.ts'],
        css: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['node_modules/**', 'tests/**', 'dist/**', 'dist-*', 'dist_*', 'web/**']
    }
});
