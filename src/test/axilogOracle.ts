/**
 * The equality oracle for the axilog native-format migration.
 *
 * Every migration unit rewrites a compute module from EI-shaped input to
 * native. The oracle is how we know the rewrite did not change a displayed
 * number: parse ONE fixture BOTH ways at the SAME axilog version, run
 * old-compute-over-EI and new-compute-over-native, and assert deep equality —
 * or an explicit, reviewed allowlist entry saying which side is right.
 *
 * Both parses use `{ everything: true }` rather than an enumerated option
 * list. `everything` is defined by axilog as "every analysis pass this version
 * knows about", so oracle coverage cannot silently narrow as axilog adds
 * passes. A consumer option list drifting from the parser's is exactly what
 * produced the original cutover audit's 30 blank fields.
 */
import { expect } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';

export const FIXTURE_PATH = path.resolve(
    __dirname,
    '../../test-fixtures/axilog/wvw-small.anon.zevtc',
);

export type CoverageState = 'present' | 'not_computed' | 'empty' | 'unsupported';

export type EntityRole = 'squad' | 'friendly_player' | 'enemy_player' | 'npc';

export interface NativeCommander {
    guid: string;
    segments: Array<[number, number]>;
    variant: string;
}

export interface NativeEntity {
    id: number;
    account: string;
    character: string;
    role: EntityRole;
    combat_participant: boolean;
    profession: string;
    elite_spec?: string;
    subgroup?: number;
    team?: string;
    guild_id?: string;
    agent_addr: number;
    instid: number;
    name?: string;
    commander?: NativeCommander;
}

export interface NativeReport {
    axilog: { schema: string; version: string; generated_from?: string };
    encounter: any;
    entities: NativeEntity[];
    catalogs: any;
    blocks: Record<string, any>;
    coverage: Record<string, CoverageState>;
    warnings?: any[];
}

export interface OraclePair {
    ei: any;
    native: NativeReport;
}

let cached: OraclePair | null = null;

/**
 * Both-ways parse of the committed fixture, memoized for the process.
 * A parse is ~0.4s, so the memo matters once a test file calls this more than
 * once.
 */
export const oracleFixture = (): OraclePair => {
    if (cached) return cached;
    cached = {
        ei: parseFileEi(FIXTURE_PATH, { everything: true } as any),
        native: parseFile(FIXTURE_PATH, { everything: true } as any) as unknown as NativeReport,
    };
    return cached;
};

export type DivergenceAllowlist = Record<string, { reason: string }>;

/**
 * Assert the EI-derived and native-derived answers agree, or that this exact
 * label is a reviewed, documented divergence.
 *
 * An allowlist entry is a DELIVERABLE, not a nuisance: each one is a statement
 * of which side is right and why. Adding one without a `reason` is not
 * possible by construction.
 */
export const expectEqualOrAllowlisted = (
    label: string,
    eiValue: unknown,
    nativeValue: unknown,
    allowlist: DivergenceAllowlist,
): void => {
    const entry = allowlist[label];
    if (entry) {
        expect(entry.reason.length, `allowlist entry "${label}" needs a reason`).toBeGreaterThan(0);
        return;
    }
    expect(nativeValue, `oracle mismatch for "${label}" (add an allowlist entry if native is right)`)
        .toEqual(eiValue);
};
