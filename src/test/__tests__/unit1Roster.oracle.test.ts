import { describe, it } from 'vitest';
import {
    partitionSquadPlayers,
    squadEntities,
    friendlyPlayerEntities,
    enemyPlayerEntities,
    getEntityAccountKey,
    getEntityProfession,
} from '@axiapps/bridge-metrics';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';

/**
 * Unit 1's reviewed divergences. Each entry is a statement of which side is
 * right and why — a deliverable, not a suppression.
 */
const ALLOWLIST: DivergenceAllowlist = {
    // Empty on the committed fixture: it contains no relog, so EI's 42
    // players[] entries are 42 distinct accounts and both sides agree. The
    // dedupe divergence the spec anticipates is exercised synthetically in
    // packages/bridge-metrics/src/__tests__/nativeRoster.test.ts instead.
};

describe('unit 1 oracle — roster & identity', () => {
    it('agrees on the squad roster', () => {
        const { ei, native } = oracleFixture();
        const eiSquad = partitionSquadPlayers(ei.players).squadPrimaries
            .map((p: any) => p.account)
            .sort();
        const nativeSquad = squadEntities(native).map((e) => e.account!).sort();
        expectEqualOrAllowlisted('squad accounts', eiSquad, nativeSquad, ALLOWLIST);
    });

    it('agrees on the non-squad ally roster', () => {
        const { ei, native } = oracleFixture();
        const eiPugs = partitionSquadPlayers(ei.players).pugPrimaries
            .map((p: any) => p.account)
            .sort();
        const nativePugs = friendlyPlayerEntities(native).map((e) => e.account!).sort();
        expectEqualOrAllowlisted('pug accounts', eiPugs, nativePugs, ALLOWLIST);
    });

    it('agrees on the enemy roster size', () => {
        const { ei, native } = oracleFixture();
        expectEqualOrAllowlisted(
            'enemy count',
            ei.targets.length,
            enemyPlayerEntities(native).length,
            ALLOWLIST,
        );
    });

    it('agrees on every squad member profession', () => {
        const { ei, native } = oracleFixture();
        const eiByAccount = new Map<string, string>();
        for (const p of ei.players) {
            if (p.notInSquad) continue;
            eiByAccount.set(p.account, p.profession);
        }
        for (const entity of squadEntities(native)) {
            expectEqualOrAllowlisted(
                `profession:${entity.account}`,
                eiByAccount.get(entity.account!),
                getEntityProfession(entity),
                ALLOWLIST,
            );
        }
    });

    it('agrees on identity keys', () => {
        const { ei, native } = oracleFixture();
        const eiKeys = ei.players
            .filter((p: any) => !p.notInSquad)
            .map((p: any) => `acct:${p.account}`)
            .sort();
        const nativeKeys = squadEntities(native).map((e) => getEntityAccountKey(e)!).sort();
        expectEqualOrAllowlisted('identity keys', eiKeys, nativeKeys, ALLOWLIST);
    });

    it('agrees on the commander', () => {
        const { ei, native } = oracleFixture();
        const eiCommanders = ei.players
            .filter((p: any) => p.hasCommanderTag)
            .map((p: any) => p.account)
            .sort();
        const nativeCommanders = native.entities
            .filter((e) => e.commander)
            .map((e) => e.account)
            .sort();
        expectEqualOrAllowlisted('commanders', eiCommanders, nativeCommanders, ALLOWLIST);
    });

    it('agrees on subgroups', () => {
        const { ei, native } = oracleFixture();
        const eiByAccount = new Map<string, number>();
        for (const p of ei.players) {
            if (p.notInSquad) continue;
            eiByAccount.set(p.account, p.group);
        }
        for (const entity of squadEntities(native)) {
            expectEqualOrAllowlisted(
                `subgroup:${entity.account}`,
                eiByAccount.get(entity.account!),
                entity.subgroup,
                ALLOWLIST,
            );
        }
    });
});
