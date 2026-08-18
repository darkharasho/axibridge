/**
 * Distinct-player identity helpers.
 *
 * arcdps emits a new agent (and EI a new `players[]` entry) when the same
 * person relogs, swaps build/character, changes subgroup, or re-enters
 * tracking range, so entry counts overstate how many people fought. These
 * helpers collapse entries to distinct people for COUNT displays only —
 * stat sums must keep iterating every entry, because each entry is a real,
 * disjoint time-slice of that player's fight.
 */

export interface SquadPartition {
    /** One primary entry (longest activeTimes[0]) per distinct squad member. */
    squadPrimaries: any[];
    /** One primary entry per distinct ally never seen in the squad. */
    pugPrimaries: any[];
}

/**
 * Strips the leading `:` arcdps writes in front of every account name.
 *
 * axilog carried that colon straight through until 0.3.7, so every log parsed
 * by the native engine before then has `:Name.1234` baked into its persisted
 * details, and every web report published from one shows the colon on screen.
 * Fixing it in the parser only fixes new parses.
 *
 * That matters beyond cosmetics: the rollup keys cross-report player identity
 * on the account string, so a user with reports from both eras would see every
 * player split into two people — `:Name.1234` and `Name.1234` — with their
 * history divided between them. Normalizing at the identity helpers folds the
 * two spellings back onto one person.
 *
 * Only a leading colon is removed, and only when something survives it. An
 * account that is empty (or a degenerate lone colon) means "unknown" to
 * callers here, and must not be turned into the other.
 */
export const normalizeAccountName = (account: string): string => {
    if (!account.startsWith(':')) return account;
    const rest = account.slice(1);
    return rest ? rest : account;
};

/**
 * Stable identity key for a player entry: account when known, else character
 * name, else null (the entry cannot be matched to any other entry).
 */
export const getPlayerAccountKey = (player: any): string | null => {
    const raw = typeof player?.account === 'string' ? player.account.trim() : '';
    const account = normalizeAccountName(raw);
    if (account && account !== 'Unknown') return `acct:${account}`;
    const name = typeof player?.name === 'string' ? player.name.trim() : '';
    if (name && name !== 'Unknown') return `name:${name}`;
    return null;
};

const getActiveTime = (player: any): number => {
    const active = Array.isArray(player?.activeTimes) ? player.activeTimes[0] : null;
    return typeof active === 'number' && Number.isFinite(active) ? active : 0;
};

/**
 * Collapse EI player entries to distinct people. Membership is
 * union-over-the-log: any in-squad entry makes the person a squad member.
 * Fake and friendly-NPC entries never count.
 */
export const partitionSquadPlayers = (players: any): SquadPartition => {
    const list: any[] = Array.isArray(players) ? players : [];
    type Bucket = { primary: any; primaryActive: number; inSquad: boolean };
    const byKey = new Map<string, Bucket>();
    const keyless: Bucket[] = [];
    list.forEach((p) => {
        if (!p || p.isFake || p.friendlyNPC) return;
        const bucket: Bucket = { primary: p, primaryActive: getActiveTime(p), inSquad: !p.notInSquad };
        const key = getPlayerAccountKey(p);
        if (key === null) {
            keyless.push(bucket);
            return;
        }
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, bucket);
            return;
        }
        existing.inSquad = existing.inSquad || bucket.inSquad;
        if (bucket.primaryActive > existing.primaryActive) {
            existing.primary = bucket.primary;
            existing.primaryActive = bucket.primaryActive;
        }
    });
    const squadPrimaries: any[] = [];
    const pugPrimaries: any[] = [];
    [...byKey.values(), ...keyless].forEach((bucket) => {
        (bucket.inSquad ? squadPrimaries : pugPrimaries).push(bucket.primary);
    });
    return { squadPrimaries, pugPrimaries };
};
