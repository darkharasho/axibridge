#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import axios from 'axios';
import FormData from 'form-data';

const args = process.argv.slice(2);
const positionals = [];
const options = new Map();

for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
        const key = arg.replace(/^--/, '');
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
        options.set(key, value);
        if (value !== 'true') i += 1;
        continue;
    }
    positionals.push(arg);
}

const getOpt = (key, fallback = '') => options.get(key) || fallback;

const logPathArg = getOpt('log', '');
let watchDir = getOpt('dir', '') || getOpt('watch-dir', '');
let dpsOutPath = getOpt('dps-out', '');
let eiOutPath = getOpt('ei-out', '');
let eiCliPath = getOpt('ei-cli', '') || process.env.EI_CLI_PATH || '';
const eiRuntime = getOpt('ei-runtime', 'auto');
const dotnetCmd = getOpt('dotnet', 'dotnet');
const wineCmd = getOpt('wine', 'wine');
const diffLimit = Number(getOpt('diff-limit', '50')) || 50;
const maxDepth = Number(getOpt('max-depth', '8')) || 8;

const readConfig = async () => {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const candidates = [
        path.join(xdgConfigHome, 'gw2-arc-log-uploader', 'config.json'),
        path.join(xdgConfigHome, 'GW2 Arc Log Uploader', 'config.json'),
        path.join(os.homedir(), '.config', 'gw2-arc-log-uploader', 'config.json'),
        path.join(os.homedir(), '.config', 'GW2 Arc Log Uploader', 'config.json')
    ];

    for (const candidate of candidates) {
        try {
            const raw = await fsp.readFile(candidate, 'utf8');
            const parsed = JSON.parse(raw);
            return {
                logDirectory: parsed?.logDirectory || '',
                dpsReportToken: parsed?.dpsReportToken || '',
                eiCliSettings: parsed?.eiCliSettings || null,
                userDataRoot: path.dirname(candidate)
            };
        } catch {
            // Ignore missing or invalid config
        }
    }

    return {
        logDirectory: '',
        dpsReportToken: '',
        eiCliSettings: null,
        userDataRoot: ''
    };
};

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

const runProcess = (command, argsToRun, cwd) => new Promise((resolve, reject) => {
    const child = spawn(command, argsToRun, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `Process exited with code ${code}`));
    });
});

const findBinary = async (root, names, depth = 0) => {
    if (depth > 4) return '';
    let entries = [];
    try {
        entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
        return '';
    }
    for (const entry of entries) {
        if (entry.isFile() && names.includes(entry.name)) {
            return path.join(root, entry.name);
        }
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const found = await findBinary(path.join(root, entry.name), names, depth + 1);
        if (found) return found;
    }
    return '';
};

const resolveCliFromUserData = async (userDataRoot) => {
    if (!userDataRoot) return { exe: '', dll: '', dotnetPath: '' };
    const cliRoot = path.join(userDataRoot, 'ei-cli', 'cli');
    const exe = await findBinary(cliRoot, ['GuildWars2EliteInsights-CLI.exe', 'gw2eicli.exe']);
    const dll = await findBinary(cliRoot, ['GuildWars2EliteInsights-CLI.dll', 'GW2EICLI.dll']);
    const dotnetPath = path.join(userDataRoot, 'ei-cli', 'dotnet_native', 'dotnet');
    const hasDotnet = await fsp
        .access(dotnetPath)
        .then(() => true)
        .catch(() => false);
    return { exe: exe || '', dll: dll || '', dotnetPath: hasDotnet ? dotnetPath : '' };
};

const pickOutputFile = async (outputDir, baseName) => {
    const candidates = [];
    const walk = async (dir, depth = 0) => {
        if (depth > 3) return;
        let entries = [];
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full, depth + 1);
                continue;
            }
            if (!entry.isFile()) continue;
            const lower = entry.name.toLowerCase();
            if (!(lower.endsWith('.json') || lower.endsWith('.json.gz'))) continue;
            const matchesBase = baseName ? lower.startsWith(baseName.toLowerCase()) : true;
            candidates.push({ full, matchesBase });
        }
    };

    await walk(outputDir);
    if (candidates.length === 0) return '';

    const filtered = candidates.some((c) => c.matchesBase)
        ? candidates.filter((c) => c.matchesBase)
        : candidates;

    const stats = await Promise.all(filtered.map(async (entry) => {
        const stat = await fsp.stat(entry.full);
        return { full: entry.full, mtime: stat.mtimeMs };
    }));
    stats.sort((a, b) => b.mtime - a.mtime);
    return stats[0].full;
};

const buildEiConfig = (outLocation, token = '') => {
    const lines = [
        'CustomTooShort=2200',
        'CompressRaw=True',
        'Anonymous=False',
        'SaveOutJSON=True',
        'RawTimelineArrays=True',
        'ParseCombatReplay=True',
        'DetailledWvW=True',
        'ParsePhases=True',
        'ComputeDamageModifiers=True',
        'SaveOutHTML=False',
        'SaveOutCSV=False',
        'SaveOutXML=False',
        'SaveOutTrace=True',
        'UploadToDPSReports=False',
        'UploadToWingman=False',
        'SendEmbedToWebhook=False',
        'SendSimpleMessageToWebhook=False',
        'AutoParse=False',
        'AutoAdd=False',
        'ParseMultipleLogs=False',
        `OutLocation=${outLocation}`,
        `DPSReportUserToken=${token}`,
        'SaveAtOut=False',
        'IndentJSON=False',
        'SingleThreaded=False',
        'AddPoVProf=False',
        'PopulateHourLimit=0',
        'MemoryLimit=0',
        'WebhookURL=',
        'HtmlExternalScripts=False',
        'HtmlCompressJson=False',
        'HtmlExternalScriptsCdn=',
        'HtmlExternalScriptsPath=',
        'LightTheme=False'
    ];
    return lines.join('\n');
};

const readJsonFile = async (filePath) => {
    const raw = await fsp.readFile(filePath);
    if (filePath.toLowerCase().endsWith('.gz')) {
        const unzipped = zlib.gunzipSync(raw);
        return JSON.parse(unzipped.toString('utf8'));
    }
    return JSON.parse(raw.toString('utf8'));
};

const fetchDpsReportJson = async (logPath) => {
    const formData = new FormData();
    formData.append('json', '1');
    formData.append('generator', 'ei');
    formData.append('detailedwvw', 'true');
    formData.append('file', fs.createReadStream(logPath));

    const uploadUrl = 'https://dps.report/uploadContent';
    const uploadHeaders = formData.getHeaders();
    console.log(`[Request] POST ${uploadUrl}`);
    console.log(`[Request] Headers: ${JSON.stringify(uploadHeaders)}`);
    console.log('[Request] Fields: json=1, generator=ei, detailedwvw=true');
    console.log(`[Request] Fields: file=@${logPath}`);

    const uploadResponse = await axios.post(uploadUrl, formData, {
        headers: uploadHeaders,
        responseType: 'text',
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    });
    const uploadBody = uploadResponse.data || '';

    const jsonMatch = uploadBody.match(/#JSON#\s*(\{[\s\S]*?\})\s*#JSON#/);
    let uploadJson = null;
    if (jsonMatch) {
        uploadJson = JSON.parse(jsonMatch[1]);
    } else {
        uploadJson = JSON.parse(uploadBody);
    }

    const permalink = typeof uploadJson.permalink === 'string' ? uploadJson.permalink : '';
    const permalinkId = (permalink.split('/').pop() || uploadJson.id || '').trim();
    if (!permalinkId) {
        throw new Error('Failed to extract permalink id from upload response.');
    }

    const jsonUrl = `https://dps.report/getJson?permalink=${permalinkId}`;
    console.log(`[Request] GET ${jsonUrl}`);
    const jsonResponse = await axios.get(jsonUrl, { responseType: 'text' });
    const jsonBody = typeof jsonResponse.data === 'string'
        ? jsonResponse.data
        : JSON.stringify(jsonResponse.data);
    return { json: JSON.parse(jsonBody), permalinkId, raw: jsonBody };
};

const resolveRuntime = (cliPath, runtime, hasDll, hasExe, preferredRuntime, dotnetPath) => {
    const normalized = runtime !== 'auto' ? runtime : preferredRuntime || 'auto';
    if (normalized !== 'auto') return normalized;
    if (hasDll && (dotnetPath || cliPath.toLowerCase().endsWith('.dll'))) return 'dotnet';
    if (hasExe && cliPath.toLowerCase().endsWith('.exe')) {
        return process.platform === 'win32' ? 'native' : 'wine';
    }
    return 'dotnet';
};

const runEiCli = async (logPath, baseName, appSettings) => {
    const preferredRuntime = appSettings?.eiCliSettings?.preferredRuntime || 'auto';
    const cliPath = eiCliPath;
    if (!cliPath) {
        throw new Error('Missing EI CLI path. Use --ei-cli or set EI_CLI_PATH.');
    }
    const hasDll = cliPath.toLowerCase().endsWith('.dll');
    const hasExe = cliPath.toLowerCase().endsWith('.exe');
    const runtime = resolveRuntime(cliPath, eiRuntime, hasDll, hasExe, preferredRuntime, appSettings?.dotnetPath || '');
    const outputRoot = path.resolve('test-fixtures', 'ei');
    const outputDir = path.resolve(outputRoot, baseName);
    await fsp.mkdir(outputDir, { recursive: true });

    const configPath = path.join(outputDir, 'ei-cli.conf');
    const configBody = buildEiConfig(outputDir, getOpt('dps-token', appSettings?.dpsReportToken || ''));
    await fsp.writeFile(configPath, configBody, 'utf8');
    console.log(`[EI] Config path: ${configPath}`);
    console.log(`[EI] OutLocation: ${outputDir}`);

    if (runtime === 'native') {
        await runProcess(cliPath, ['-c', configPath, logPath], outputDir);
    } else if (runtime === 'dotnet') {
        const dotnetBin = appSettings?.dotnetPath || dotnetCmd;
        await runProcess(dotnetBin, [cliPath, '-c', configPath, logPath], outputDir);
    } else if (runtime === 'wine') {
        await runProcess(wineCmd, [cliPath, '-c', configPath, logPath], outputDir);
    } else {
        throw new Error(`Unsupported EI runtime: ${runtime}`);
    }

    const outputFile = await pickOutputFile(outputDir, baseName);
    if (!outputFile) {
        try {
            const entries = await fsp.readdir(outputDir);
            console.log(`[EI] Output dir contents (${outputDir}): ${entries.join(', ') || '(empty)'}`);
            for (const entry of entries) {
                const full = path.join(outputDir, entry);
                const stat = await fsp.stat(full).catch(() => null);
                if (stat?.isDirectory()) {
                    const sub = await fsp.readdir(full).catch(() => []);
                    console.log(`[EI] Subdir ${full}: ${sub.join(', ') || '(empty)'}`);
                }
            }
        } catch (error) {
            console.log(`[EI] Failed to read output dir (${outputDir}): ${error?.message || String(error)}`);
        }
        throw new Error('EI CLI finished but no JSON output was found.');
    }
    const json = await readJsonFile(outputFile);
    return { json, outputFile };
};

const compareJson = (left, right, limit, depthLimit) => {
    const diffs = [];
    const seen = new Set();

    const walk = (pathParts, a, b, depth) => {
        if (diffs.length >= limit) return;
        if (depth > depthLimit) return;

        const key = `${pathParts.join('.')}:${typeof a}:${typeof b}`;
        if (seen.has(key)) return;
        seen.add(key);

        if (a === b) return;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
            diffs.push({ path: pathParts.join(''), left: a, right: b });
            return;
        }

        if (Array.isArray(a) || Array.isArray(b)) {
            if (!Array.isArray(a) || !Array.isArray(b)) {
                diffs.push({ path: pathParts.join(''), left: a, right: b });
                return;
            }
            if (a.length !== b.length) {
                diffs.push({ path: `${pathParts.join('')}.length`, left: a.length, right: b.length });
            }
            const max = Math.max(a.length, b.length);
            for (let i = 0; i < max; i += 1) {
                walk([...pathParts, `[${i}]`], a[i], b[i], depth + 1);
                if (diffs.length >= limit) return;
            }
            return;
        }

        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const keyName of keys) {
            walk([...pathParts, pathParts.length ? `.${keyName}` : keyName], a[keyName], b[keyName], depth + 1);
            if (diffs.length >= limit) return;
        }
    };

    walk(['$'], left, right, 0);
    return diffs;
};

const main = async () => {
    let logPath = logPathArg;
    const appSettings = await readConfig();
    if (!logPath) {
        watchDir = watchDir || appSettings.logDirectory || process.env.GW2_LOG_DIR || '';
        if (!watchDir) {
            console.error('Usage: node scripts/compare-dps-vs-ei.mjs --log <file> [--ei-cli <path>] [--dir <watch-dir>]');
            console.error('  Provide --log for a specific log, or --dir/GW2_LOG_DIR for latest log.');
            process.exit(1);
        }
        logPath = await findLatestLog(watchDir);
    }

    if (!logPath) {
        console.error('No log file found.');
        process.exit(1);
    }

    if (!eiCliPath) {
        const resolved = await resolveCliFromUserData(appSettings.userDataRoot);
        if (resolved.dll) {
            eiCliPath = resolved.dll;
        } else if (resolved.exe) {
            eiCliPath = resolved.exe;
        }
        if (resolved.dotnetPath) {
            appSettings.dotnetPath = resolved.dotnetPath;
        }
    }
    if (!eiCliPath && appSettings.userDataRoot) {
        console.warn('[Warn] EI CLI not found under app userData/ei-cli/cli. Use --ei-cli to specify it.');
    }

    const baseName = path.basename(logPath).replace(/\.(zevtc|evtc)$/i, '');
    dpsOutPath = dpsOutPath || path.join('test-fixtures', 'boon', `${baseName}.json`);
    eiOutPath = eiOutPath || path.join('test-fixtures', 'ei', `${baseName}.json`);

    console.log(`Log: ${logPath}`);

    const dpsResult = await fetchDpsReportJson(logPath);
    await fsp.mkdir(path.dirname(dpsOutPath), { recursive: true });
    await fsp.writeFile(dpsOutPath, JSON.stringify(dpsResult.json));
    console.log(`dps.report JSON: ${dpsOutPath}`);

    const eiResult = await runEiCli(logPath, baseName, appSettings);
    await fsp.mkdir(path.dirname(eiOutPath), { recursive: true });
    await fsp.writeFile(eiOutPath, JSON.stringify(eiResult.json));
    console.log(`EI JSON: ${eiOutPath}`);

    const diffs = compareJson(dpsResult.json, eiResult.json, diffLimit, maxDepth);
    if (diffs.length === 0) {
        console.log('JSON matches (within limits).');
        return;
    }

    console.log(`Found ${diffs.length}${diffs.length >= diffLimit ? '+' : ''} differences (showing up to ${diffLimit}).`);
    for (const diff of diffs) {
        console.log(`- ${diff.path}:`, diff.left, '!=', diff.right);
    }
};

main().catch((err) => {
    console.error(err?.message || String(err));
    process.exit(1);
});
