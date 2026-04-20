#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const defaultPath = path.join(os.homedir(), '.config', 'AxiBridge-Dev', 'config.json');
const inputPath = process.argv[2] || defaultPath;
const settingsPath = path.resolve(inputPath);

const readSettings = () => {
    try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        console.error(`[fake-first-time] Failed to read ${settingsPath}`);
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
};

const settings = readSettings();
settings.walkthroughSeen = false;
delete settings.lastSeenVersion;

try {
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    console.log(`[fake-first-time] Updated ${settingsPath}`);
    console.log('[fake-first-time] walkthroughSeen=false, lastSeenVersion removed');
} catch (error) {
    console.error(`[fake-first-time] Failed to write ${settingsPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
