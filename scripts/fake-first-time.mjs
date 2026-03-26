#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2] || 'axibridge-settings.json';
const settingsPath = path.resolve(process.cwd(), inputPath);

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
