import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as zlib from 'zlib';
import { EventEmitter } from 'events';
import { generateEiConf, DEFAULT_EI_SETTINGS, isNewerVersion, EiManager } from '../eiParser';

// ─── Module mocks (hoisted) ────────────────────────────────────────────────

const {
    mockSpawn,
    mockExistsSync, mockMkdirSync, mockMkdtempSync, mockWriteFileSync,
    mockReadFileSync, mockReaddirSync, mockRmSync, mockUnlinkSync,
    mockChmodSync, mockCreateWriteStream,
} = vi.hoisted(() => ({
    mockSpawn: vi.fn(),
    mockExistsSync: vi.fn().mockReturnValue(true),
    mockMkdirSync: vi.fn(),
    mockMkdtempSync: vi.fn().mockReturnValue('/tmp/ei-parse-test-abc'),
    mockWriteFileSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockReaddirSync: vi.fn().mockReturnValue(['20260408-log_wvw.json.gz']),
    mockRmSync: vi.fn(),
    mockUnlinkSync: vi.fn(),
    mockChmodSync: vi.fn(),
    mockCreateWriteStream: vi.fn(),
}));

vi.mock('child_process', () => {
    const mod = {
        spawn: (...args: any[]) => mockSpawn(...args),
        ChildProcess: class {},
    };
    return { ...mod, default: mod };
});

vi.mock('fs', () => ({
    default: {},
    existsSync: (...args: any[]) => mockExistsSync(...args),
    mkdirSync: (...args: any[]) => mockMkdirSync(...args),
    mkdtempSync: (...args: any[]) => mockMkdtempSync(...args),
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    readdirSync: (...args: any[]) => mockReaddirSync(...args),
    rmSync: (...args: any[]) => mockRmSync(...args),
    unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
    chmodSync: (...args: any[]) => mockChmodSync(...args),
    createWriteStream: (...args: any[]) => mockCreateWriteStream(...args),
}));

vi.mock('adm-zip');

// ─── Helpers ────────────────────────────────────────────────────────────────

const GZIPPED_JSON = zlib.gzipSync(Buffer.from(JSON.stringify({ fightName: 'Test WvW' })));

function makeChildProcess(exitCode = 0) {
    const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
        pid: number;
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();
    proc.pid = 12345;

    if (exitCode !== -1) {
        setTimeout(() => proc.emit('close', exitCode), 5);
    }
    return proc;
}

beforeEach(() => {
    vi.clearAllMocks();

    mockExistsSync.mockReturnValue(true);
    mockMkdtempSync.mockReturnValue('/tmp/ei-parse-test-abc');
    mockReaddirSync.mockReturnValue(['20260408-log_wvw.json.gz']);
    mockReadFileSync.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('versions.json')) {
            return JSON.stringify({ cli: 'v3.20.0.0', dotnet: '8.0', lastChecked: Date.now() });
        }
        if (p.endsWith('.json.gz')) {
            return GZIPPED_JSON;
        }
        return '';
    });
});

afterEach(() => {
    // Don't use restoreAllMocks — it undoes vi.mock factories
});

// ─── Pure function tests ────────────────────────────────────────────────────

describe('generateEiConf', () => {
    it('generates valid conf with default settings', () => {
        const conf = generateEiConf(DEFAULT_EI_SETTINGS, '/tmp/ei-output');
        expect(conf).toContain('SaveOutJSON=True');
        expect(conf).toContain('SaveOutHTML=False');
        expect(conf).toContain('DetailledWvW=True');
        expect(conf).toContain('OutLocation=/tmp/ei-output');
        expect(conf).toContain('CompressRaw=True');
        expect(conf).toContain('UploadToDPSReports=False');
        expect(conf).toContain('UploadToWingman=False');
        expect(conf).toContain('SaveAtOut=False');
    });

    it('reflects custom settings', () => {
        const settings = { ...DEFAULT_EI_SETTINGS, detailledWvW: false, saveOutHTML: true, memoryLimit: 4096 };
        const conf = generateEiConf(settings, '/tmp/out');
        expect(conf).toContain('DetailledWvW=False');
        expect(conf).toContain('SaveOutHTML=True');
        expect(conf).toContain('MemoryLimit=4096');
    });

    it('uses SaveAtOut=False and custom OutLocation', () => {
        const conf = generateEiConf(DEFAULT_EI_SETTINGS, '/my/output/dir');
        expect(conf).toContain('SaveAtOut=False');
        expect(conf).toContain('OutLocation=/my/output/dir');
    });

    // EI v3.24 only emits the distToCom/stackDist distance-to-tag scalars when
    // combat replay is parsed (older EI computed them for free). So we always
    // parse replay to keep "Closest to Tag" working; the `parseCombatReplay`
    // setting instead controls whether the heavy position arrays are RETAINED
    // after parse (see pruneDetailsForStats). The EI flag is therefore forced on.
    it('always parses combat replay even when the setting is off', () => {
        const conf = generateEiConf({ ...DEFAULT_EI_SETTINGS, parseCombatReplay: false }, '/tmp/out');
        expect(conf).toContain('ParseCombatReplay=True');
    });

    it('parses combat replay when the setting is on', () => {
        const conf = generateEiConf({ ...DEFAULT_EI_SETTINGS, parseCombatReplay: true }, '/tmp/out');
        expect(conf).toContain('ParseCombatReplay=True');
    });
});

describe('isNewerVersion', () => {
    it('detects newer version', () => {
        expect(isNewerVersion('v3.20.0.0', 'v3.21.0.0')).toBe(true);
    });

    it('returns false for same version', () => {
        expect(isNewerVersion('v3.20.0.0', 'v3.20.0.0')).toBe(false);
    });

    it('returns false for older version', () => {
        expect(isNewerVersion('v3.21.0.0', 'v3.20.0.0')).toBe(false);
    });

    it('handles missing v prefix', () => {
        expect(isNewerVersion('3.20.0.0', '3.21.0.0')).toBe(true);
    });
});

// ─── EiManager tests ────────────────────────────────────────────────────────

describe('EiManager', () => {
    let mgr: EiManager;

    beforeEach(() => {
        mgr = new EiManager('/fake/userData');
    });

    describe('isInstalled', () => {
        it('returns true when CLI binary and dotnet exist (linux)', () => {
            const origPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
            mockExistsSync.mockReturnValue(true);

            expect(mgr.isInstalled()).toBe(true);

            Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
        });

        it('returns false when CLI binary missing', () => {
            mockExistsSync.mockReturnValue(false);
            expect(mgr.isInstalled()).toBe(false);
        });

        it('returns false on linux when dotnet missing but DLL exists', () => {
            const origPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
            mockExistsSync.mockImplementation((p: any) => {
                return p.toString().includes('GuildWars2EliteInsights-CLI.dll');
            });

            expect(mgr.isInstalled()).toBe(false);

            Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
        });
    });

    describe('getStatus', () => {
        it('returns installed status with version from versions.json', () => {
            const status = mgr.getStatus();
            expect(status.installed).toBe(true);
            expect(status.version).toBe('v3.20.0.0');
            expect(status.updateAvailable).toBeNull();
        });

        it('returns installed false when binary missing', () => {
            mockExistsSync.mockImplementation((p: any) => {
                if (p.toString().endsWith('versions.json')) return true;
                return false;
            });
            const status = mgr.getStatus();
            expect(status.installed).toBe(false);
        });

        it('returns null version when versions.json missing', () => {
            mockExistsSync.mockImplementation((p: any) => {
                if (p.toString().endsWith('versions.json')) return false;
                return true;
            });
            const status = mgr.getStatus();
            expect(status.version).toBeNull();
        });

        it('handles corrupt versions.json gracefully', () => {
            mockReadFileSync.mockImplementation((p: any) => {
                if (p.toString().endsWith('versions.json')) return 'NOT VALID JSON';
                return '';
            });
            const status = mgr.getStatus();
            expect(status.version).toBeNull();
        });
    });

    describe('settings', () => {
        it('returns default settings initially', () => {
            expect(mgr.getSettings()).toEqual(DEFAULT_EI_SETTINGS);
        });

        it('setSettings creates a copy', () => {
            const custom = { ...DEFAULT_EI_SETTINGS, memoryLimit: 4096 };
            mgr.setSettings(custom);
            custom.memoryLimit = 0;
            expect(mgr.getSettings().memoryLimit).toBe(4096);
        });

        it('getSettings returns a copy', () => {
            const a = mgr.getSettings();
            const b = mgr.getSettings();
            expect(a).toEqual(b);
            expect(a).not.toBe(b);
        });
    });

    describe('parseLog', () => {
        it('runs CLI, reads gzipped output, returns parsed JSON', async () => {
            const proc = makeChildProcess(0);
            mockSpawn.mockReturnValue(proc);

            const result = await mgr.parseLog('/logs/test.zevtc', 'log-123');

            expect(result).toEqual({ fightName: 'Test WvW' });
            expect(mockMkdtempSync).toHaveBeenCalledWith(
                expect.stringContaining('ei-parse-log-123-')
            );
            expect(mockRmSync).toHaveBeenCalledWith('/tmp/ei-parse-test-abc', { recursive: true, force: true });
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining('settings.conf'),
                expect.stringContaining('SaveOutJSON=True'),
                'utf8'
            );
        });

        it('throws when EI is not installed', async () => {
            mockExistsSync.mockReturnValue(false);

            await expect(mgr.parseLog('/logs/test.zevtc', 'log-123'))
                .rejects.toThrow('EI CLI is not installed');
        });

        it('throws when no .json.gz output is produced', async () => {
            const proc = makeChildProcess(0);
            mockSpawn.mockReturnValue(proc);
            mockReaddirSync.mockReturnValue([]);

            await expect(mgr.parseLog('/logs/test.zevtc', 'log-123'))
                .rejects.toThrow('EI parser did not produce a .json.gz output file');
        });

        it('cleans up temp dir even when CLI exits non-zero', async () => {
            const proc = makeChildProcess(1);
            mockSpawn.mockReturnValue(proc);

            await expect(mgr.parseLog('/logs/test.zevtc', 'log-123'))
                .rejects.toThrow('EI CLI exited with code 1');

            expect(mockRmSync).toHaveBeenCalledWith('/tmp/ei-parse-test-abc', { recursive: true, force: true });
        });

        it('spawns dotnet on linux', async () => {
            const origPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

            const proc = makeChildProcess(0);
            mockSpawn.mockReturnValue(proc);

            await mgr.parseLog('/logs/test.zevtc', 'log-123');

            expect(mockSpawn).toHaveBeenCalledWith(
                expect.stringContaining(path.join('dotnet_native', 'dotnet')),
                expect.arrayContaining([expect.stringContaining('GuildWars2EliteInsights-CLI.dll')]),
                expect.any(Object)
            );

            Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
        });

        it('spawns exe directly on windows', async () => {
            const origPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

            const proc = makeChildProcess(0);
            mockSpawn.mockReturnValue(proc);

            await mgr.parseLog('/logs/test.zevtc', 'log-123');

            expect(mockSpawn).toHaveBeenCalledWith(
                expect.stringContaining('GuildWars2EliteInsights-CLI.exe'),
                expect.arrayContaining(['-c']),
                expect.any(Object)
            );

            Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
        });

        it('forwards stdout/stderr to parseProgressCallback', async () => {
            const proc = makeChildProcess(-1);
            mockSpawn.mockReturnValue(proc);

            const progressLines: string[] = [];
            mgr.setParseProgressCallback((line) => progressLines.push(line));

            const parsePromise = mgr.parseLog('/logs/test.zevtc', 'log-123');

            proc.stdout.emit('data', Buffer.from('Parsing: 50%\n'));
            proc.stderr.emit('data', Buffer.from('Warning: large file\n'));
            proc.emit('close', 0);

            await parsePromise;
            expect(progressLines).toContain('Parsing: 50%\n');
            expect(progressLines).toContain('Warning: large file\n');
        });

        it('rejects on spawn error', async () => {
            const proc = makeChildProcess(-1);
            mockSpawn.mockReturnValue(proc);

            const parsePromise = mgr.parseLog('/logs/test.zevtc', 'log-123');
            proc.emit('error', new Error('ENOENT'));

            await expect(parsePromise).rejects.toThrow('ENOENT');
        });

        it('passes log path and conf path to spawned process', async () => {
            const proc = makeChildProcess(0);
            mockSpawn.mockReturnValue(proc);

            await mgr.parseLog('/logs/my-fight.zevtc', 'fight-456');

            const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
            expect(spawnArgs).toContain('/logs/my-fight.zevtc');
            expect(spawnArgs.some((a: string) => a.includes('settings.conf'))).toBe(true);
        });
    });

    describe('killActiveProcess', () => {
        it('kills the running process', async () => {
            const proc = makeChildProcess(-1);
            mockSpawn.mockReturnValue(proc);

            const parsePromise = mgr.parseLog('/logs/test.zevtc', 'log-123');

            mgr.killActiveProcess();
            expect(proc.kill).toHaveBeenCalled();

            proc.emit('error', new Error('killed'));
            await expect(parsePromise).rejects.toThrow();
        });

        it('no-ops when no active process', () => {
            expect(() => mgr.killActiveProcess()).not.toThrow();
        });
    });

    describe('uninstall', () => {
        it('removes cli, dotnet, versions, and settings files', () => {
            mgr.uninstall();

            expect(mockRmSync).toHaveBeenCalledWith(
                expect.stringContaining('eicli'),
                { recursive: true, force: true }
            );
            expect(mockRmSync).toHaveBeenCalledWith(
                expect.stringContaining('dotnet_native'),
                { recursive: true, force: true }
            );
            expect(mockUnlinkSync).toHaveBeenCalledWith(
                expect.stringContaining('versions.json')
            );
            expect(mockUnlinkSync).toHaveBeenCalledWith(
                expect.stringContaining('settings.conf')
            );
        });

        it('kills active process before removing files', async () => {
            const proc = makeChildProcess(-1);
            mockSpawn.mockReturnValue(proc);

            const parsePromise = mgr.parseLog('/logs/test.zevtc', 'log-123');
            mgr.uninstall();

            expect(proc.kill).toHaveBeenCalled();

            proc.emit('error', new Error('killed'));
            await expect(parsePromise).rejects.toThrow();
        });

        it('handles missing files gracefully', () => {
            mockExistsSync.mockReturnValue(false);
            expect(() => mgr.uninstall()).not.toThrow();
            expect(mockRmSync).not.toHaveBeenCalled();
            expect(mockUnlinkSync).not.toHaveBeenCalled();
        });
    });
});
