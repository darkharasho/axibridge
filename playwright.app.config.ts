import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e/app',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://127.0.0.1:4174',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'npx serve dist-react -l 4174 --single --no-clipboard',
        url: 'http://127.0.0.1:4174',
        reuseExistingServer: !process.env.CI
    }
});
