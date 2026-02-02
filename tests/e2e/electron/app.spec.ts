import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const shouldSkipElectron = process.env.ELECTRON_RUN_AS_NODE === '1';

test('electron app launches', async () => {
    test.skip(
        shouldSkipElectron,
        'Electron cannot launch when ELECTRON_RUN_AS_NODE=1 in this environment.'
    );
    if (shouldSkipElectron) {
        return;
    }
    const distIndexPath = path.resolve(process.cwd(), 'dist-react/index.html');
    if (!fs.existsSync(distIndexPath)) {
        throw new Error('dist-react/index.html not found. Run "npm run build:electron:test" before the electron E2E.');
    }
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ELECTRON_DISABLE_SANDBOX: '1',
        ELECTRON_NO_SANDBOX: '1',
        VITE_DEV_SERVER_URL: pathToFileURL(distIndexPath).toString()
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-gpu-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '.'
        ],
        env
    });
    const window = await app.firstWindow();
    await expect(window).toHaveTitle(/ArcBridge/i);
    await app.close();
});
