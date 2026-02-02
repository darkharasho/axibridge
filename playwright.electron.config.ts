import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e/electron',
    timeout: 90_000,
    retries: process.env.CI ? 1 : 0,
    use: {
        trace: 'retain-on-failure'
    }
});
