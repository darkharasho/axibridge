import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e/web',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'npm run dev:web',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI
    }
});
