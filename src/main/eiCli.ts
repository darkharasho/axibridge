import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawn, spawnSync } from 'child_process';
import zlib from 'zlib';

const AdmZip = require('adm-zip');

export type EiCliRuntimePreference = 'auto' | 'dotnet' | 'wine';

export interface EiCliSettings {
    enabled: boolean;
    autoSetup: boolean;
    autoUpdate: boolean;
    preferredRuntime: EiCliRuntimePreference;
}

export interface EiCliLoadResult {
    json: any | null;
    source: 'cache' | 'parsed' | 'disabled' | 'error';
    error?: string;
    runtime?: 'native' | 'dotnet' | 'wine';
    outputPath?: string;
}

export const DEFAULT_EI_CLI_SETTINGS: EiCliSettings = {
    enabled: false,
    autoSetup: true,
    autoUpdate: true,
    preferredRuntime: 'auto'
};

const EI_REPO = 'baaron4/GW2-Elite-Insights-Parser';
const EI_ASSET = 'GW2EICLI.zip';
const DOTNET_INSTALL_URL = 'https://dot.net/v1/dotnet-install.sh';

const getEiBaseDir = () => path.join(app.getPath('userData'), 'ei-cli');
const getEiCliDir = () => path.join(getEiBaseDir(), 'cli');
const getEiCacheDir = () => path.join(getEiBaseDir(), 'cache');
const getEiOutputDir = () => path.join(getEiBaseDir(), 'output');
const getEiVersionFile = () => path.join(getEiBaseDir(), 'version.json');
const getEiDotnetInstallDir = () => path.join(getEiBaseDir(), 'dotnet_native');
const getEiDotnetPath = () => path.join(getEiDotnetInstallDir(), 'dotnet');

const fetchJson = async <T>(url: string): Promise<T> => {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'gw2-arc-log-uploader',
                    'Accept': 'application/vnd.github+json'
                }
            },
            (res) => {
                if (!res.statusCode || res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode || 0} from ${url}`));
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => {
                    try {
                        const raw = Buffer.concat(chunks).toString('utf8');
                        resolve(JSON.parse(raw) as T);
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        );
        req.on('error', reject);
    });
};

const downloadFile = async (url: string, dest: string): Promise<void> => {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    return new Promise((resolve, reject) => {
        const request = https.get(
            url,
            { headers: { 'User-Agent': 'gw2-arc-log-uploader' } },
            (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                    return;
                }
                if (!res.statusCode || res.statusCode >= 400) {
                    reject(new Error(`Download failed (${res.statusCode || 0})`));
                    return;
                }
                const fileStream = fs.createWriteStream(dest);
                res.pipe(fileStream);
                fileStream.on('finish', () => fileStream.close(() => resolve()));
                fileStream.on('error', reject);
            }
        );
        request.on('error', reject);
    });
};

const readVersion = async (): Promise<string | null> => {
    try {
        const raw = await fs.promises.readFile(getEiVersionFile(), 'utf8');
        const parsed = JSON.parse(raw) as { version?: string };
        return typeof parsed.version === 'string' ? parsed.version : null;
    } catch {
        return null;
    }
};

const writeVersion = async (version: string) => {
    await fs.promises.mkdir(getEiBaseDir(), { recursive: true });
    await fs.promises.writeFile(getEiVersionFile(), JSON.stringify({ version }), 'utf8');
};

const findBinary = async (root: string, names: string[], depth = 0): Promise<string | null> => {
    if (depth > 4) return null;
    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
        return null;
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
    return null;
};

const resolveCliBinaries = async () => {
    const root = getEiCliDir();
    const exe = await findBinary(root, ['GuildWars2EliteInsights-CLI.exe', 'gw2eicli.exe']);
    const dll = await findBinary(root, ['GuildWars2EliteInsights-CLI.dll', 'GW2EICLI.dll']);
    return { exe, dll };
};

const commandExists = (command: string) => {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(checker, [command], { stdio: 'ignore' });
    return result.status === 0;
};

const ensureNativeDotnet = async (allowInstall: boolean) => {
    const existing = getEiDotnetPath();
    if (fs.existsSync(existing)) return existing;
    if (!allowInstall) return null;
    await fs.promises.mkdir(getEiDotnetInstallDir(), { recursive: true });
    const scriptPath = path.join(getEiBaseDir(), 'dotnet-install.sh');
    await downloadFile(DOTNET_INSTALL_URL, scriptPath);
    try {
        fs.chmodSync(scriptPath, 0o755);
    } catch {
        // ignore chmod failures
    }
    await new Promise<void>((resolve, reject) => {
        const child = spawn('bash', [scriptPath, '--channel', '8.0', '--runtime', 'dotnet', '--install-dir', getEiDotnetInstallDir(), '--no-path'], {
            stdio: 'ignore'
        });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`dotnet-install exited with ${code}`));
        });
        child.on('error', reject);
    });
    return fs.existsSync(existing) ? existing : null;
};

const resolveWinePaths = async (pathsToConvert: string[]) => {
    if (!commandExists('winepath')) {
        return pathsToConvert;
    }
    const converted: string[] = [];
    for (const p of pathsToConvert) {
        const result = spawnSync('winepath', ['-w', p], { encoding: 'utf8' });
        const value = result.status === 0 ? result.stdout.trim() : '';
        converted.push(value || p);
    }
    return converted;
};

const ensureEiCliInstalled = async (settings: EiCliSettings): Promise<{ ok: boolean; version?: string; error?: string }> => {
    const cliDir = getEiCliDir();
    const existing = await resolveCliBinaries();
    const hasBinary = Boolean(existing.exe || existing.dll);
    if (hasBinary) {
        return { ok: true, version: await readVersion() || undefined };
    }
    if (!settings.autoSetup) {
        return { ok: false, error: 'EI CLI not found and auto-setup is disabled.' };
    }
    const release = await fetchJson<any>(`https://api.github.com/repos/${EI_REPO}/releases/latest`);
    const asset = Array.isArray(release?.assets)
        ? release.assets.find((entry: any) => entry?.name === EI_ASSET)
        : null;
    if (!asset?.browser_download_url) {
        return { ok: false, error: 'Failed to locate GW2EICLI.zip in the latest release.' };
    }
    await fs.promises.mkdir(cliDir, { recursive: true });
    const zipPath = path.join(getEiBaseDir(), EI_ASSET);
    await downloadFile(asset.browser_download_url, zipPath);
    const zip = new AdmZip(zipPath);
    await fs.promises.rm(cliDir, { recursive: true, force: true });
    zip.extractAllTo(cliDir, true);
    await fs.promises.unlink(zipPath);
    const version = release?.tag_name || release?.name || 'unknown';
    await writeVersion(version);
    return { ok: true, version };
};

export const updateEiCliIfNeeded = async (settings: EiCliSettings) => {
    if (!settings.enabled || !settings.autoUpdate) return { updated: false };
    const currentVersion = await readVersion();
    const existing = await resolveCliBinaries();
    if (!existing.exe && !existing.dll) {
        if (!settings.autoSetup) {
            return { updated: false, error: 'EI CLI not installed and auto-setup disabled.' };
        }
        const installed = await ensureEiCliInstalled(settings);
        return { updated: installed.ok, version: installed.version };
    }

    const release = await fetchJson<any>(`https://api.github.com/repos/${EI_REPO}/releases/latest`);
    const latestVersion = release?.tag_name || release?.name || 'unknown';
    if (!latestVersion || latestVersion === currentVersion) {
        return { updated: false, version: currentVersion || undefined };
    }

    const asset = Array.isArray(release?.assets)
        ? release.assets.find((entry: any) => entry?.name === EI_ASSET)
        : null;
    if (!asset?.browser_download_url) {
        return { updated: false, error: 'Failed to locate GW2EICLI.zip in the latest release.' };
    }

    const cliDir = getEiCliDir();
    await fs.promises.mkdir(cliDir, { recursive: true });
    const zipPath = path.join(getEiBaseDir(), EI_ASSET);
    await downloadFile(asset.browser_download_url, zipPath);
    const zip = new AdmZip(zipPath);
    await fs.promises.rm(cliDir, { recursive: true, force: true });
    zip.extractAllTo(cliDir, true);
    await fs.promises.unlink(zipPath);
    await writeVersion(latestVersion);

    return { updated: true, version: latestVersion };
};

const buildEiConfig = (outLocation: string, token?: string | null) => {
    const safeToken = token || '';
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
        `DPSReportUserToken=${safeToken}`,
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

const runProcess = (command: string, args: string[], cwd: string) => {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(stderr || `Process exited with code ${code}`));
            }
        });
    });
};

const pickOutputFile = async (outputDir: string, baseName: string) => {
    const entries = await fs.promises.readdir(outputDir);
    const matches = entries.filter((file) => {
        const lower = file.toLowerCase();
        if (!(lower.endsWith('.json') || lower.endsWith('.json.gz'))) return false;
        if (!baseName) return true;
        return lower.startsWith(baseName.toLowerCase());
    });
    const candidates = matches.length ? matches : entries.filter((file) => {
        const lower = file.toLowerCase();
        return lower.endsWith('.json') || lower.endsWith('.json.gz');
    });
    if (candidates.length === 0) return null;
    const stats = await Promise.all(candidates.map(async (file) => {
        const full = path.join(outputDir, file);
        const stat = await fs.promises.stat(full);
        return { file, mtime: stat.mtimeMs };
    }));
    stats.sort((a, b) => b.mtime - a.mtime);
    return path.join(outputDir, stats[0].file);
};

const readOutputJson = async (filePath: string) => {
    const raw = await fs.promises.readFile(filePath);
    if (filePath.toLowerCase().endsWith('.gz')) {
        const inflated = zlib.gunzipSync(raw);
        return JSON.parse(inflated.toString('utf8'));
    }
    return JSON.parse(raw.toString('utf8'));
};

export const loadEiCliJsonForLog = async (payload: {
    filePath: string;
    cacheKey?: string | null;
    settings: EiCliSettings;
    dpsReportToken?: string | null;
}): Promise<EiCliLoadResult> => {
    const { filePath, cacheKey, settings, dpsReportToken } = payload;
    if (!settings.enabled) {
        return { json: null, source: 'disabled' };
    }

    const cacheDir = getEiCacheDir();
    const cachePath = cacheKey ? path.join(cacheDir, `${cacheKey}.json`) : null;
    if (cachePath) {
        try {
            const cached = await fs.promises.readFile(cachePath, 'utf8');
            return { json: JSON.parse(cached), source: 'cache' };
        } catch {
            // ignore cache miss
        }
    }

    const install = await ensureEiCliInstalled(settings);
    if (!install.ok) {
        return { json: null, source: 'error', error: install.error };
    }

    const binaries = await resolveCliBinaries();
    const exePath = binaries.exe;
    const dllPath = binaries.dll;
    let dotnetPath: string | null = null;
    if (dllPath) {
        dotnetPath = commandExists('dotnet') ? 'dotnet' : null;
        if (!dotnetPath && process.platform !== 'win32') {
            dotnetPath = await ensureNativeDotnet(settings.autoSetup !== false);
        }
    }
    const hasDotnet = Boolean(dotnetPath);
    const hasWine = commandExists('wine') && Boolean(exePath);

    let runtime: 'native' | 'dotnet' | 'wine' | null = null;
    if (process.platform === 'win32' && exePath) {
        runtime = 'native';
    } else {
        if (settings.preferredRuntime === 'dotnet' && hasDotnet) runtime = 'dotnet';
        if (settings.preferredRuntime === 'wine' && hasWine) runtime = 'wine';
        if (!runtime && hasDotnet) runtime = 'dotnet';
        if (!runtime && hasWine) runtime = 'wine';
    }

    if (!runtime) {
        return {
            json: null,
            source: 'error',
            error: 'No compatible runtime found (dotnet/wine missing).'
        };
    }

    const baseName = path.basename(filePath).replace(/\.(zevtc|evtc)$/i, '');
    const outputRoot = getEiOutputDir();
    await fs.promises.mkdir(outputRoot, { recursive: true });
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const safeKey = (cacheKey || baseName || 'log').replace(/[^a-z0-9._-]+/gi, '_');
    const outputDir = path.join(outputRoot, safeKey);
    await fs.promises.mkdir(outputDir, { recursive: true });

    const configPath = path.join(outputDir, 'ei-cli.conf');
    const configOutLocation = runtime === 'wine'
        ? (await resolveWinePaths([outputDir]))[0]
        : outputDir;
    const configBody = buildEiConfig(configOutLocation || outputDir, dpsReportToken);
    await fs.promises.writeFile(configPath, configBody, 'utf8');

    if (runtime === 'native') {
        await runProcess(exePath!, ['-c', configPath, filePath], outputDir);
    } else if (runtime === 'dotnet') {
        await runProcess(dotnetPath!, [dllPath!, '-c', configPath, filePath], outputDir);
    } else if (runtime === 'wine') {
        const [wineConfigPath, wineLogPath] = await resolveWinePaths([configPath, filePath]);
        await runProcess('wine', [exePath!, '-c', wineConfigPath, wineLogPath], outputDir);
    }

    const outputFile = await pickOutputFile(outputDir, baseName);
    if (!outputFile) {
        return {
            json: null,
            source: 'error',
            runtime,
            error: 'EI CLI finished but no JSON output was found.'
        };
    }
    const json = await readOutputJson(outputFile);
    if (cachePath) {
        await fs.promises.writeFile(cachePath, JSON.stringify(json), 'utf8');
    }
    return { json, source: 'parsed', runtime, outputPath: outputFile };
};
