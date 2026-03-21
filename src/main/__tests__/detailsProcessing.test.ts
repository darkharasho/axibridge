import { describe, it, expect, vi } from 'vitest';
import {
    resolveTimestampSeconds,
    resolveDetailsUploadTime,
    pruneDetailsForStats,
    buildDashboardSummaryFromDetails,
    buildManifestEntry,
    hasUsableFightDetails,
    isDetailsPermalinkNotFound,
} from '../detailsProcessing';

// ─── resolveTimestampSeconds ──────────────────────────────────────────────────

describe('resolveTimestampSeconds', () => {
    it('returns undefined for null / undefined / empty string', () => {
        expect(resolveTimestampSeconds(null)).toBeUndefined();
        expect(resolveTimestampSeconds(undefined)).toBeUndefined();
        expect(resolveTimestampSeconds('')).toBeUndefined();
    });

    it('returns undefined for non-finite numbers', () => {
        expect(resolveTimestampSeconds(NaN)).toBeUndefined();
        expect(resolveTimestampSeconds(Infinity)).toBeUndefined();
    });

    it('returns undefined for zero or negative numbers', () => {
        expect(resolveTimestampSeconds(0)).toBeUndefined();
        expect(resolveTimestampSeconds(-1)).toBeUndefined();
    });

    it('divides millisecond timestamps (>1e12) by 1000', () => {
        const ms = 1700000000000; // 2023-11-14T…
        const expected = Math.floor(ms / 1000);
        expect(resolveTimestampSeconds(ms)).toBe(expected);
    });

    it('returns seconds timestamps (<=1e12) unchanged', () => {
        const sec = 1700000000;
        expect(resolveTimestampSeconds(sec)).toBe(sec);
    });

    it('parses numeric string milliseconds', () => {
        const ms = 1700000000000;
        expect(resolveTimestampSeconds(String(ms))).toBe(Math.floor(ms / 1000));
    });

    it('parses numeric string seconds', () => {
        expect(resolveTimestampSeconds('1700000000')).toBe(1700000000);
    });

    it('parses ISO 8601 date string', () => {
        const iso = '2023-11-14T22:13:20.000Z';
        const expected = Math.floor(Date.parse(iso) / 1000);
        expect(resolveTimestampSeconds(iso)).toBe(expected);
    });

    it('parses ISO 8601 date string with numeric timezone offset (missing colon)', () => {
        // Some EI JSON uses "+0100" instead of "+01:00"
        const iso = '2023-11-14T23:13:20+0100';
        const result = resolveTimestampSeconds(iso);
        expect(result).toBeTruthy();
        expect(typeof result).toBe('number');
    });

    it('returns undefined for unparseable strings', () => {
        expect(resolveTimestampSeconds('not-a-date')).toBeUndefined();
    });

    it('floors fractional values', () => {
        expect(resolveTimestampSeconds(1700000000.9)).toBe(1700000000);
    });
});

// ─── resolveDetailsUploadTime ─────────────────────────────────────────────────

describe('resolveDetailsUploadTime', () => {
    it('uses details.uploadTime first', () => {
        const d = { uploadTime: 1700000000 };
        expect(resolveDetailsUploadTime(d)).toBe(1700000000);
    });

    it('falls back to fallback.uploadTime when details.uploadTime is absent', () => {
        const d = { timeStart: '2023-01-01T00:00:00.000Z' };
        const fallback = { uploadTime: 1700000000 };
        expect(resolveDetailsUploadTime(d, fallback)).toBe(1700000000);
    });

    it('falls back through the chain: timeStartStd → timeStart → timeEndStd → timeEnd', () => {
        expect(resolveDetailsUploadTime({ timeStartStd: 1700000001 })).toBe(1700000001);
        expect(resolveDetailsUploadTime({ timeStart: 1700000002 })).toBe(1700000002);
        expect(resolveDetailsUploadTime({ timeEndStd: 1700000003 })).toBe(1700000003);
        expect(resolveDetailsUploadTime({ timeEnd: 1700000004 })).toBe(1700000004);
    });

    it('returns undefined when all fields are absent', () => {
        expect(resolveDetailsUploadTime({})).toBeUndefined();
        expect(resolveDetailsUploadTime(null)).toBeUndefined();
    });
});

// ─── pruneDetailsForStats ─────────────────────────────────────────────────────

describe('pruneDetailsForStats', () => {
    it('returns non-object inputs unchanged', () => {
        expect(pruneDetailsForStats(null)).toBeNull();
        expect(pruneDetailsForStats('string')).toBe('string');
        expect(pruneDetailsForStats(42)).toBe(42);
    });

    it('passes through all fields except denied ones', () => {
        const details = {
            players: [],
            targets: [],
            fightName: 'Eternal Coliseum',
            durationMS: 60000,
            success: true,
            permalink: 'https://dps.report/abc',
            mechanics: [{ name: 'Stomp', data: [] }],
            __unknown__: 'should survive'
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.fightName).toBe('Eternal Coliseum');
        expect(pruned.durationMS).toBe(60000);
        expect(pruned.success).toBe(true);
        expect(pruned.permalink).toBe('https://dps.report/abc');
        expect(pruned.__unknown__).toBe('should survive');
        expect(pruned.mechanics).toBeUndefined();
    });

    it('passes through all player fields', () => {
        const player = {
            name: 'Alice',
            profession: 'Guardian',
            __secret__: 'keep me',
            dpsAll: [{ dps: 10000 }]
        };
        const pruned = pruneDetailsForStats({ players: [player], targets: [] });
        const p = pruned.players[0];
        expect(p.name).toBe('Alice');
        expect(p.profession).toBe('Guardian');
        expect(p.dpsAll).toBeDefined();
        expect(p.__secret__).toBe('keep me');
    });

    it('passes through all target fields', () => {
        const target = {
            id: 1,
            name: 'Enemy',
            isFake: false,
            __extra__: 'keep me'
        };
        const pruned = pruneDetailsForStats({ players: [], targets: [target] });
        const t = pruned.targets[0];
        expect(t.id).toBe(1);
        expect(t.name).toBe('Enemy');
        expect(t.__extra__).toBe('keep me');
    });

    it('prunes combatReplayData on targets to only start/down/dead', () => {
        const target = {
            id: 1,
            combatReplayData: [
                { start: 0, down: 1000, dead: 2000, secret: 'nope' }
            ]
        };
        const pruned = pruneDetailsForStats({ targets: [target], players: [] });
        const entry = pruned.targets[0].combatReplayData[0];
        expect(entry.start).toBe(0);
        expect(entry.down).toBe(1000);
        expect(entry.dead).toBe(2000);
        expect(entry.secret).toBeUndefined();
    });

    it('handles combatReplayData as object (not array)', () => {
        const target = {
            id: 1,
            combatReplayData: { start: 100, down: 200, dead: 300, extra: 'drop' }
        };
        const pruned = pruneDetailsForStats({ targets: [target], players: [] });
        const crd = pruned.targets[0].combatReplayData;
        expect(crd.start).toBe(100);
        expect(crd.extra).toBeUndefined();
    });

    it('handles missing players / targets arrays gracefully', () => {
        const pruned = pruneDetailsForStats({ fightName: 'Test' });
        expect(pruned.players).toBeUndefined();
        expect(pruned.targets).toBeUndefined();
        expect(pruned.fightName).toBe('Test');
    });
});

// ─── buildDashboardSummaryFromDetails ─────────────────────────────────────────

describe('buildDashboardSummaryFromDetails', () => {
    it('returns zeroed summary for empty payload', () => {
        const summary = buildDashboardSummaryFromDetails({});
        expect(summary.hasPlayers).toBe(false);
        expect(summary.hasTargets).toBe(false);
        expect(summary.squadCount).toBe(0);
        expect(summary.enemyCount).toBe(0);
        expect(summary.isWin).toBeNull();
        expect(summary.squadDeaths).toBe(0);
        expect(summary.enemyDeaths).toBe(0);
    });

    it('excludes notInSquad players from squadCount', () => {
        const players = [
            { notInSquad: false, defenses: [{}] },
            { notInSquad: true, defenses: [{}] },
        ];
        const summary = buildDashboardSummaryFromDetails({ players, targets: [] });
        expect(summary.squadCount).toBe(1);
    });

    it('counts squad deaths from defenses[0].deadCount', () => {
        const players = [
            { defenses: [{ downCount: 2, deadCount: 1 }] },
        ];
        const summary = buildDashboardSummaryFromDetails({ players, targets: [] });
        expect(summary.squadDeaths).toBe(1);
    });

    it('accumulates enemy downs/deaths from statsTargets', () => {
        const players = [
            {
                statsTargets: [[{ downed: 3, killed: 2 }]],
                defenses: [{}]
            },
        ];
        const summary = buildDashboardSummaryFromDetails({ players, targets: [] });
        expect(summary.enemyDeaths).toBe(2);
    });

    it('determines win when enemy downs > squad downs', () => {
        const players = [
            {
                statsTargets: [[{ downed: 5, killed: 3 }]],
                defenses: [{ downCount: 1, deadCount: 0 }]
            },
        ];
        const summary = buildDashboardSummaryFromDetails({ players, targets: [] });
        expect(summary.isWin).toBe(true);
    });

    it('determines loss when squad downs > enemy downs', () => {
        const players = [
            {
                statsTargets: [[{ downed: 0, killed: 0 }]],
                defenses: [{ downCount: 5, deadCount: 3 }]
            },
        ];
        const summary = buildDashboardSummaryFromDetails({ players, targets: [] });
        expect(summary.isWin).toBe(false);
    });

    it('falls back to details.success when no downs recorded', () => {
        const players = [{ defenses: [{}], statsTargets: [] }];
        const summary = buildDashboardSummaryFromDetails({ players, targets: [], success: true });
        expect(summary.isWin).toBe(true);
    });

    it('defaults isWin to false when no downs and no success field', () => {
        const players = [{ defenses: [{}], statsTargets: [] }];
        const summary = buildDashboardSummaryFromDetails({ players, targets: [] });
        expect(summary.isWin).toBe(false);
    });

    it('counts non-fake targets', () => {
        const targets = [
            { isFake: false },
            { isFake: true },
            { isFake: false },
        ];
        const summary = buildDashboardSummaryFromDetails({ players: [], targets });
        expect(summary.enemyCount).toBe(2);
    });

    it('sets hasTargets based on targets array presence', () => {
        expect(buildDashboardSummaryFromDetails({ players: [], targets: [{ isFake: false }] }).hasTargets).toBe(true);
        expect(buildDashboardSummaryFromDetails({ players: [], targets: [] }).hasTargets).toBe(false);
    });
});

// ─── buildManifestEntry ───────────────────────────────────────────────────────

describe('buildManifestEntry', () => {
    it('uses details.id when present', () => {
        const entry = buildManifestEntry({ id: 'custom-id', players: [] }, '/a.zevtc', 0);
        expect(entry.id).toBe('custom-id');
    });

    it('generates fallback id from index when details.id is absent', () => {
        const entry = buildManifestEntry({ players: [] }, '/a.zevtc', 4);
        expect(entry.id).toBe('dev-log-5');
    });

    it('stores filePath correctly', () => {
        const entry = buildManifestEntry({}, '/path/to/file.zevtc', 0);
        expect(entry.filePath).toBe('/path/to/file.zevtc');
    });

    it('counts squad vs non-squad players', () => {
        const players = [
            { notInSquad: false },
            { notInSquad: false },
            { notInSquad: true },
        ];
        const entry = buildManifestEntry({ players }, '/f', 0);
        expect(entry.playerCount).toBe(3);
        expect(entry.squadCount).toBe(2);
        expect(entry.nonSquadCount).toBe(1);
    });

    it('handles absent players array', () => {
        const entry = buildManifestEntry({}, '/f', 0);
        expect(entry.playerCount).toBe(0);
        expect(entry.squadCount).toBe(0);
    });

    it('resolves uploadTime via resolveDetailsUploadTime', () => {
        const entry = buildManifestEntry({ uploadTime: 1700000000 }, '/f', 0);
        expect(entry.uploadTime).toBe(1700000000);
    });
});

// ─── hasUsableFightDetails ────────────────────────────────────────────────────

describe('hasUsableFightDetails', () => {
    it('returns false for null / undefined', () => {
        expect(hasUsableFightDetails(null)).toBe(false);
        expect(hasUsableFightDetails(undefined)).toBe(false);
    });

    it('returns false when players array is empty', () => {
        expect(hasUsableFightDetails({ players: [] })).toBe(false);
    });

    it('returns false when players is not an array', () => {
        expect(hasUsableFightDetails({ players: null })).toBe(false);
    });

    it('returns true when at least one player is present', () => {
        expect(hasUsableFightDetails({ players: [{ name: 'Alice' }] })).toBe(true);
    });
});

// ─── isDetailsPermalinkNotFound ───────────────────────────────────────────────

describe('isDetailsPermalinkNotFound', () => {
    it('returns true for a 404 details-http-error', () => {
        expect(isDetailsPermalinkNotFound({ error: 'details-http-error', statusCode: 404 })).toBe(true);
    });

    it('returns false when statusCode is not 404', () => {
        expect(isDetailsPermalinkNotFound({ error: 'details-http-error', statusCode: 403 })).toBe(false);
    });

    it('returns false when error code does not match', () => {
        expect(isDetailsPermalinkNotFound({ error: 'other-error', statusCode: 404 })).toBe(false);
    });

    it('returns false for null', () => {
        expect(isDetailsPermalinkNotFound(null)).toBe(false);
    });

    it('is case-insensitive for the error string', () => {
        expect(isDetailsPermalinkNotFound({ error: 'DETAILS-HTTP-ERROR', statusCode: 404 })).toBe(true);
    });
});
