import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    removeEliteInsights,
    ELITE_INSIGHTS_REMOVAL_KEY,
    ELITE_INSIGHTS_REMOVAL_NOTICE_KEY,
} from '../eliteInsightsRemoval';

class FakeStore {
    data: Record<string, unknown> = {};
    get(key: string) { return this.data[key]; }
    set(key: string, value: unknown) { this.data[key] = value; }
    delete(key: string) { delete this.data[key]; }
}

let userData: string;

const seedInstall = (bytes: number) => {
    const dir = path.join(userData, 'elite-insights', 'eicli');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'GW2EICLI.dll'), Buffer.alloc(bytes));
};

beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-ei-removal-'));
});

afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
});

describe('removeEliteInsights', () => {
    it('deletes the install and reports what it reclaimed', () => {
        const store = new FakeStore();
        seedInstall(4096);

        const notice = removeEliteInsights(store, userData);

        expect(notice).toEqual({ wasSelected: false, reclaimedBytes: 4096 });
        expect(fs.existsSync(path.join(userData, 'elite-insights'))).toBe(false);
    });

    it('reports that the user had chosen the engine it just removed', () => {
        const store = new FakeStore();
        store.set('parserBackend', 'elite-insights');

        expect(removeEliteInsights(store, userData)?.wasSelected).toBe(true);
    });

    it('drops every store key the removed backend owned', () => {
        const store = new FakeStore();
        store.set('parserBackend', 'elite-insights');
        store.set('parserBackendMigratedToAxilog', true);
        store.set('parserBackendMigrationNotice', true);
        store.set('eiAutoManage', false);
        // Not the backend's: the parser settings outlive it under their old key.
        store.set('eiParserSettings', { parseCombatReplay: true });

        removeEliteInsights(store, userData);

        expect(store.data.parserBackend).toBeUndefined();
        expect(store.data.parserBackendMigratedToAxilog).toBeUndefined();
        expect(store.data.parserBackendMigrationNotice).toBeUndefined();
        expect(store.data.eiAutoManage).toBeUndefined();
        expect(store.data.eiParserSettings).toEqual({ parseCombatReplay: true });
    });

    it('runs exactly once, even with an install still on disk', () => {
        const store = new FakeStore();
        seedInstall(4096);
        removeEliteInsights(store, userData);
        expect(store.data[ELITE_INSIGHTS_REMOVAL_KEY]).toBe(true);

        seedInstall(4096);
        expect(removeEliteInsights(store, userData)).toBeNull();
        // Untouched: the one chance was spent, so a directory that reappeared
        // is someone else's now.
        expect(fs.existsSync(path.join(userData, 'elite-insights'))).toBe(true);
    });

    it('says nothing to a fresh install that never had Elite Insights', () => {
        const store = new FakeStore();

        expect(removeEliteInsights(store, userData)).toBeNull();
        expect(store.data[ELITE_INSIGHTS_REMOVAL_KEY]).toBe(true);
        expect(store.data[ELITE_INSIGHTS_REMOVAL_NOTICE_KEY]).toBeUndefined();
    });

    it('still completes when the install directory cannot be deleted', () => {
        const store = new FakeStore();
        store.set('parserBackend', 'elite-insights');
        // A *file* where the directory is expected: rmSync succeeds, sizing does
        // not walk it. The point is that neither throws out of the startup path.
        fs.writeFileSync(path.join(userData, 'elite-insights'), 'not a directory');

        expect(() => removeEliteInsights(store, userData)).not.toThrow();
        expect(store.data[ELITE_INSIGHTS_REMOVAL_KEY]).toBe(true);
    });
});
