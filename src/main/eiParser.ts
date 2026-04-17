import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';
import * as zlib from 'zlib';
import AdmZip from 'adm-zip';

export interface EiParserSettings {
    detailledWvW: boolean;
    computeDamageModifiers: boolean;
    parsePhases: boolean;
    skipFailedTries: boolean;
    anonymous: boolean;
    customTooShort: number;
    saveOutHTML: boolean;
    parseCombatReplay: boolean;
    lightTheme: boolean;
    rawTimelineArrays: boolean;
    singleThreaded: boolean;
    memoryLimit: number;
}

export const DEFAULT_EI_SETTINGS: EiParserSettings = {
    detailledWvW: true,
    computeDamageModifiers: true,
    parsePhases: true,
    skipFailedTries: false,
    anonymous: false,
    customTooShort: 2200,
    saveOutHTML: false,
    parseCombatReplay: true,
    lightTheme: false,
    rawTimelineArrays: true,
    singleThreaded: false,
    memoryLimit: 0,
};

function boolToConf(val: boolean): string {
    return val ? 'True' : 'False';
}

export function generateEiConf(settings: EiParserSettings, outLocation: string): string {
    const lines: string[] = [
        `SaveOutJSON=True`,
        `SaveOutHTML=${boolToConf(settings.saveOutHTML)}`,
        `SaveOutCSV=False`,
        `SaveOutTrace=False`,
        `CompressRaw=True`,
        `SaveAtOut=False`,
        `OutLocation=${outLocation}`,
        `DetailledWvW=${boolToConf(settings.detailledWvW)}`,
        `RawTimelineArrays=${boolToConf(settings.rawTimelineArrays)}`,
        `ComputeDamageModifiers=${boolToConf(settings.computeDamageModifiers)}`,
        `ParseCombatReplay=${boolToConf(settings.parseCombatReplay)}`,
        `ParsePhases=${boolToConf(settings.parsePhases)}`,
        `SingleThreaded=${boolToConf(settings.singleThreaded)}`,
        `SkipFailedTries=${boolToConf(settings.skipFailedTries)}`,
        `Anonymous=${boolToConf(settings.anonymous)}`,
        `ParseMultipleLogs=False`,
        `UploadToDPSReports=False`,
        `UploadToWingman=False`,
        `IndentJSON=False`,
        `MemoryLimit=${settings.memoryLimit}`,
        `CustomTooShort=${settings.customTooShort}`,
        `LightTheme=${boolToConf(settings.lightTheme)}`,
        `HtmlExternalScripts=False`,
    ];
    return lines.join('\n') + '\n';
}

export function isNewerVersion(current: string, candidate: string): boolean {
    const parse = (v: string) => v.replace(/^v/i, '').split('.').map(Number);
    const cur = parse(current);
    const cand = parse(candidate);
    for (let i = 0; i < Math.max(cur.length, cand.length); i++) {
        const a = cur[i] || 0;
        const b = cand[i] || 0;
        if (b > a) return true;
        if (b < a) return false;
    }
    return false;
}

interface VersionsJson {
    cli: string;
    dotnet: string;
    lastChecked: number;
}

const GITHUB_RELEASES_API = 'https://api.github.com/repos/baaron4/GW2-Elite-Insights-Parser/releases/latest';
const DOTNET_INSTALL_URL = 'https://dot.net/v1/dotnet-install.sh';
const CLI_ZIP_ASSET = 'GW2EICLI.zip';
const EI_CLI_DLL = 'GuildWars2EliteInsights-CLI.dll';
const EI_CLI_EXE = 'GuildWars2EliteInsights-CLI.exe';

type ProgressCallback = (progress: { stage: string; percent?: number }) => void;
type ParseProgressCallback = (line: string) => void;

export class EiManager {
    private baseDir: string;
    private cliDir: string;
    private dotnetDir: string;
    private versionsPath: string;
    private settingsConfPath: string;
    private settings: EiParserSettings;
    private progressCallback: ProgressCallback | null = null;
    private parseProgressCallback: ParseProgressCallback | null = null;
    private activeProcess: ChildProcess | null = null;

    constructor(userDataPath: string) {
        this.baseDir = path.join(userDataPath, 'elite-insights');
        this.cliDir = path.join(this.baseDir, 'eicli');
        this.dotnetDir = path.join(this.baseDir, 'dotnet_native');
        this.versionsPath = path.join(this.baseDir, 'versions.json');
        this.settingsConfPath = path.join(this.baseDir, 'settings.conf');
        this.settings = { ...DEFAULT_EI_SETTINGS };
    }

    isInstalled(): boolean {
        const isLinux = process.platform === 'linux';
        const binaryExists = isLinux
            ? fs.existsSync(path.join(this.cliDir, EI_CLI_DLL))
            : fs.existsSync(path.join(this.cliDir, EI_CLI_EXE));
        if (!binaryExists) return false;
        if (isLinux) {
            const dotnetExe = path.join(this.dotnetDir, 'dotnet');
            return fs.existsSync(dotnetExe);
        }
        return true;
    }

    getStatus(): { installed: boolean; version: string | null; updateAvailable: string | null } {
        const installed = this.isInstalled();
        let version: string | null = null;
        let updateAvailable: string | null = null;
        if (fs.existsSync(this.versionsPath)) {
            try {
                const data: VersionsJson = JSON.parse(fs.readFileSync(this.versionsPath, 'utf8'));
                version = data.cli || null;
                updateAvailable = null; // populated by checkForUpdate
            } catch {
                // ignore
            }
        }
        return { installed, version, updateAvailable };
    }

    setSettings(settings: EiParserSettings): void {
        this.settings = { ...settings };
    }

    getSettings(): EiParserSettings {
        return { ...this.settings };
    }

    setProgressCallback(cb: ProgressCallback): void {
        this.progressCallback = cb;
    }

    setParseProgressCallback(cb: ParseProgressCallback): void {
        this.parseProgressCallback = cb;
    }

    private emitProgress(stage: string, percent?: number): void {
        if (this.progressCallback) {
            this.progressCallback({ stage, percent });
        }
    }

    async install(): Promise<void> {
        fs.mkdirSync(this.baseDir, { recursive: true });
        fs.mkdirSync(this.cliDir, { recursive: true });
        await this.installCli();
        if (process.platform === 'linux') {
            fs.mkdirSync(this.dotnetDir, { recursive: true });
            await this.installDotnetLinux();
        }
    }

    async installCli(): Promise<void> {
        this.emitProgress('Fetching release info');
        const releaseInfo = await this.fetchLatestRelease();
        const asset = releaseInfo.assets.find((a: { name: string; browser_download_url: string }) => a.name === CLI_ZIP_ASSET);
        if (!asset) {
            throw new Error(`Could not find ${CLI_ZIP_ASSET} in latest release`);
        }
        this.emitProgress('Downloading CLI', 0);
        const zipPath = path.join(this.baseDir, 'GW2EICLI.zip');
        await this.downloadFile(asset.browser_download_url, zipPath, (percent) => {
            this.emitProgress('Downloading CLI', percent);
        });
        this.emitProgress('Extracting CLI');
        fs.mkdirSync(this.cliDir, { recursive: true });
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(this.cliDir, true);
        fs.unlinkSync(zipPath);
        this.saveVersions({ cli: releaseInfo.tag_name, dotnet: this.readVersions().dotnet, lastChecked: Date.now() });
        this.emitProgress('CLI installed');
    }

    async installDotnetLinux(): Promise<void> {
        this.emitProgress('Downloading .NET install script');
        const scriptPath = path.join(this.baseDir, 'dotnet-install.sh');
        await this.downloadFile(DOTNET_INSTALL_URL, scriptPath);
        fs.chmodSync(scriptPath, 0o755);
        this.emitProgress('Installing .NET 8.0 runtime');
        await new Promise<void>((resolve, reject) => {
            const proc = spawn('bash', [scriptPath, '--channel', '8.0', '--runtime', 'dotnet', '--install-dir', this.dotnetDir], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            proc.stdout?.on('data', (data: Buffer) => {
                if (this.parseProgressCallback) this.parseProgressCallback(data.toString());
            });
            proc.stderr?.on('data', (data: Buffer) => {
                if (this.parseProgressCallback) this.parseProgressCallback(data.toString());
            });
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`dotnet-install.sh exited with code ${code}`));
            });
        });
        try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
        const versions = this.readVersions();
        this.saveVersions({ ...versions, dotnet: '8.0', lastChecked: Date.now() });
        this.emitProgress('.NET installed');
    }

    async reinstall(): Promise<void> {
        if (fs.existsSync(this.cliDir)) {
            fs.rmSync(this.cliDir, { recursive: true, force: true });
        }
        if (process.platform === 'linux' && fs.existsSync(this.dotnetDir)) {
            fs.rmSync(this.dotnetDir, { recursive: true, force: true });
        }
        if (fs.existsSync(this.versionsPath)) {
            fs.unlinkSync(this.versionsPath);
        }
        await this.install();
    }

    uninstall(): void {
        this.killActiveProcess();
        if (fs.existsSync(this.cliDir)) {
            fs.rmSync(this.cliDir, { recursive: true, force: true });
        }
        if (fs.existsSync(this.dotnetDir)) {
            fs.rmSync(this.dotnetDir, { recursive: true, force: true });
        }
        if (fs.existsSync(this.versionsPath)) {
            fs.unlinkSync(this.versionsPath);
        }
        if (fs.existsSync(this.settingsConfPath)) {
            fs.unlinkSync(this.settingsConfPath);
        }
    }

    async checkForUpdate(): Promise<string | null> {
        try {
            const releaseInfo = await this.fetchLatestRelease();
            const latestTag: string = releaseInfo.tag_name;
            const versions = this.readVersions();
            const currentVersion = versions.cli;
            if (!currentVersion) return latestTag;
            if (isNewerVersion(currentVersion, latestTag)) return latestTag;
            return null;
        } catch {
            return null;
        }
    }

    async parseLog(logPath: string, logId: string): Promise<unknown> {
        if (!this.isInstalled()) {
            throw new Error('EI CLI is not installed');
        }
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ei-parse-${logId}-`));
        try {
            const outLocation = tmpDir;
            const confContent = generateEiConf(this.settings, outLocation);
            fs.writeFileSync(this.settingsConfPath, confContent, 'utf8');

            await this.runCli(this.settingsConfPath, logPath);

            // Find the output .json.gz file
            const files = fs.readdirSync(tmpDir);
            const jsonGz = files.find((f) => f.endsWith('.json.gz'));
            if (!jsonGz) {
                throw new Error('EI parser did not produce a .json.gz output file');
            }
            const compressed = fs.readFileSync(path.join(tmpDir, jsonGz));
            const decompressed = await new Promise<Buffer>((resolve, reject) => {
                zlib.gunzip(compressed, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            return JSON.parse(decompressed.toString('utf8'));
        } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    }

    killActiveProcess(): void {
        if (this.activeProcess) {
            try { this.activeProcess.kill(); } catch { /* ignore */ }
            this.activeProcess = null;
        }
    }

    private runCli(confPath: string, logPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const isLinux = process.platform === 'linux';
            let cmd: string;
            let args: string[];
            if (isLinux) {
                cmd = path.join(this.dotnetDir, 'dotnet');
                args = [path.join(this.cliDir, EI_CLI_DLL), '-c', confPath, logPath];
            } else {
                cmd = path.join(this.cliDir, EI_CLI_EXE);
                args = ['-c', confPath, logPath];
            }

            const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            this.activeProcess = proc;

            const timeout = setTimeout(() => {
                proc.kill();
                reject(new Error('EI parse timed out after 10 minutes'));
            }, 10 * 60 * 1000);

            proc.stdout?.on('data', (data: Buffer) => {
                if (this.parseProgressCallback) this.parseProgressCallback(data.toString());
            });
            proc.stderr?.on('data', (data: Buffer) => {
                if (this.parseProgressCallback) this.parseProgressCallback(data.toString());
            });
            proc.on('close', (code) => {
                clearTimeout(timeout);
                this.activeProcess = null;
                if (code === 0) resolve();
                else reject(new Error(`EI CLI exited with code ${code}`));
            });
            proc.on('error', (err) => {
                clearTimeout(timeout);
                this.activeProcess = null;
                reject(err);
            });
        });
    }

    private fetchLatestRelease(): Promise<{ tag_name: string; assets: { name: string; browser_download_url: string }[] }> {
        return new Promise((resolve, reject) => {
            const options = {
                headers: { 'User-Agent': 'AxiBridge/1.0' },
            };
            https.get(GITHUB_RELEASES_API, options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                });
            }).on('error', reject);
        });
    }

    private downloadFile(url: string, dest: string, onProgress?: (percent: number) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const followRedirect = (redirectUrl: string) => {
                const lib = redirectUrl.startsWith('https') ? https : http;
                const options = { headers: { 'User-Agent': 'AxiBridge/1.0' } };
                lib.get(redirectUrl, options, (res) => {
                    if (res.statusCode && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)) {
                        followRedirect(res.headers.location!);
                        return;
                    }
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode} downloading ${redirectUrl}`));
                        return;
                    }
                    const total = parseInt(res.headers['content-length'] || '0', 10);
                    let received = 0;
                    const file = fs.createWriteStream(dest);
                    res.on('data', (chunk: Buffer) => {
                        received += chunk.length;
                        if (onProgress && total > 0) {
                            onProgress(Math.round((received / total) * 100));
                        }
                    });
                    res.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                    file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
                }).on('error', reject);
            };
            followRedirect(url);
        });
    }

    private readVersions(): VersionsJson {
        if (fs.existsSync(this.versionsPath)) {
            try {
                return JSON.parse(fs.readFileSync(this.versionsPath, 'utf8')) as VersionsJson;
            } catch {
                // fall through
            }
        }
        return { cli: '', dotnet: '', lastChecked: 0 };
    }

    private saveVersions(versions: VersionsJson): void {
        fs.mkdirSync(this.baseDir, { recursive: true });
        fs.writeFileSync(this.versionsPath, JSON.stringify(versions, null, 2), 'utf8');
    }
}
