import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/__tests__/**/*.test.ts'],
        pool: 'forks',
        poolOptions: { forks: { maxForks: 2, minForks: 1 } },
        maxWorkers: 2
    }
});
