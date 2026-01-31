#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import FormData from 'form-data';

const args = process.argv.slice(2);
const positionals = [];
let watchDir = '';
let outPath = '';

for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dir' || arg === '--watch-dir') {
        watchDir = args[i + 1] || '';
        i += 1;
        continue;
    }
    if (arg === '--out') {
        outPath = args[i + 1] || '';
        i += 1;
        continue;
    }
    if (arg.startsWith('-')) {
        continue;
    }
    positionals.push(arg);
}

if (!watchDir && positionals.length > 0) {
    watchDir = positionals[0];
}

if (!outPath && positionals.length > 1) {
    outPath = positionals[1];
}

if (!watchDir && process.env.GW2_LOG_DIR) {
    watchDir = process.env.GW2_LOG_DIR;
}

const readConfigLogDir = async () => {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const candidates = [
        path.join(xdgConfigHome, 'ArcBridge', 'config.json'),
        path.join(xdgConfigHome, 'arcbridge', 'config.json'),
        path.join(xdgConfigHome, 'gw2-arc-log-uploader', 'config.json'),
        path.join(xdgConfigHome, 'GW2 Arc Log Uploader', 'config.json'),
        path.join(os.homedir(), '.config', 'ArcBridge', 'config.json'),
        path.join(os.homedir(), '.config', 'arcbridge', 'config.json'),
        path.join(os.homedir(), '.config', 'gw2-arc-log-uploader', 'config.json'),
        path.join(os.homedir(), '.config', 'GW2 Arc Log Uploader', 'config.json')
    ];

    for (const candidate of candidates) {
        try {
            const raw = await fsp.readFile(candidate, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed?.logDirectory) {
                return parsed.logDirectory;
            }
        } catch {
            // Ignore missing or invalid config
        }
    }

    return '';
};

if (!watchDir) {
    watchDir = await readConfigLogDir();
}

if (!watchDir) {
    console.error('Usage: node scripts/fetch-latest-log-json.mjs <watch-dir> [output-json]');
    console.error('  Or set GW2_LOG_DIR, or configure the app log directory so it can be detected.');
    process.exit(1);
}

const stat = await fsp.stat(watchDir).catch(() => null);
if (!stat || !stat.isDirectory()) {
    console.error(`Watch directory not found: ${watchDir}`);
    process.exit(1);
}

const findLatestLog = async (dir) => {
    let latestPath = '';
    let latestMtime = 0;

    const walk = async (current) => {
        let entries = [];
        try {
            entries = await fsp.readdir(current, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (!fullPath.endsWith('.evtc') && !fullPath.endsWith('.zevtc')) {
                continue;
            }
            const fileStat = await fsp.stat(fullPath).catch(() => null);
            if (!fileStat) {
                continue;
            }
            if (fileStat.mtimeMs > latestMtime) {
                latestMtime = fileStat.mtimeMs;
                latestPath = fullPath;
            }
        }
    };

    await walk(dir);
    return latestPath;
};

const latestLog = await findLatestLog(watchDir);
if (!latestLog) {
    console.error(`No .evtc/.zevtc logs found in ${watchDir}`);
    process.exit(1);
}

const defaultOutPath = () => {
    const base = path.basename(latestLog).replace(/\.(evtc|zevtc)$/i, '');
    return path.join('test-fixtures', 'boon', `${base}.json`);
};

const finalOutPath = outPath || defaultOutPath();
await fsp.mkdir(path.dirname(finalOutPath), { recursive: true });

const formData = new FormData();
formData.append('json', '1');
formData.append('generator', 'ei');
formData.append('detailedwvw', 'true');
formData.append('file', fs.createReadStream(latestLog));

let uploadBody = '';
try {
    const uploadUrl = 'https://dps.report/uploadContent';
    const uploadHeaders = formData.getHeaders();
    console.log(`[Request] POST ${uploadUrl}`);
    console.log(`[Request] Headers: ${JSON.stringify(uploadHeaders)}`);
    console.log('[Request] Fields: json=1, generator=ei, detailedwvw=true');
    console.log(`[Request] Fields: file=@${latestLog}`);
    const uploadResponse = await axios.post('https://dps.report/uploadContent', formData, {
        headers: uploadHeaders,
        responseType: 'text',
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });
    uploadBody = uploadResponse.data || '';
} catch (error) {
    console.error('Upload failed.');
    if (error?.response?.data) {
        console.error(String(error.response.data));
    } else {
        console.error(error?.message || String(error));
    }
    process.exit(1);
}

const jsonMatch = uploadBody.match(/#JSON#\s*(\{[\s\S]*?\})\s*#JSON#/);
let uploadJson = null;
if (jsonMatch) {
    try {
        uploadJson = JSON.parse(jsonMatch[1]);
    } catch {
        uploadJson = null;
    }
} else {
    try {
        uploadJson = JSON.parse(uploadBody);
    } catch {
        uploadJson = null;
    }
}

if (!uploadJson) {
    console.error('Upload response did not contain JSON.');
    process.exit(1);
}

const permalink = typeof uploadJson.permalink === 'string' ? uploadJson.permalink : '';
const permalinkId = (permalink.split('/').pop() || uploadJson.id || '').trim();
if (!permalinkId) {
    console.error('Failed to extract permalink id from upload response.');
    process.exit(1);
}

let jsonBody = '';
const jsonUrl = `https://dps.report/getJson?permalink=${permalinkId}`;
try {
    console.log(`[Request] GET ${jsonUrl}`);
    const jsonResponse = await axios.get(jsonUrl, {
        responseType: 'text'
    });
    jsonBody = jsonResponse.data;
} catch (error) {
    console.error('Failed to fetch JSON from dps.report.');
    if (error?.response?.data) {
        console.error(String(error.response.data));
    } else {
        console.error(error?.message || String(error));
    }
    process.exit(1);
}

if (typeof jsonBody !== 'string') {
    jsonBody = JSON.stringify(jsonBody);
}

await fsp.writeFile(finalOutPath, jsonBody);

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const relativeOut = path.relative(scriptDir, path.resolve(finalOutPath));

console.log(`Latest log: ${latestLog}`);
console.log(`Permalink id: ${permalinkId}`);
console.log(`Wrote ${relativeOut.startsWith('..') ? finalOutPath : relativeOut}`);
