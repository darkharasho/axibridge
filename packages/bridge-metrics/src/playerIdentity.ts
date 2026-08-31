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
    /**
     * One primary entry (longest activeTimes[0]) per distinct squad member
     * who did something, or had something done to them — see
     * {@link isCombatInactiveEntry}. This is the count every squad AVERAGE
     * divides by, so members who sat the fight out are excluded here and
     * surface in {@link idleSquadPrimaries} instead.
     */
    squadPrimaries: any[];
    /**
     * The rest of the squad roster: distinct members with no measurable
     * activity at all. Present so callers that want the roster rather than
     * the fighting strength (guild tallies, "who was in the squad") can put
     * the two halves back together.
     */
    idleSquadPrimaries: any[];
    /** One primary entry per distinct ally never seen in the squad. */
    pugPrimaries: any[];
}

/**
 * Every EI-shaped field that records a player DOING or RECEIVING something.
 *
 * `buffUptimes` and `selfBuffs` are deliberately absent: an idle player
 * standing inside the squad still shows boons landing on them, so they
 * measure proximity rather than participation. `activeTimes` is absent for
 * the same reason — it reads as the full fight duration for a player who
 * never moved.
 */
const COMBAT_SURFACE = [
    'dpsAll',
    'statsAll',
    'statsTargets',
    'defenses',
    'support',
    'extHealingStats',
    'extBarrierStats',
    'squadBuffs',
    'groupBuffs',
] as const;

/**
 * True when nothing in this entry's combat surface is non-zero.
 *
 * A squad roster carries people who never joined the fight — arcdps logs a
 * squadmate who was out of range, alt-tabbed, or still running from the
 * waypoint, and axilog keeps them because they really are on the roster.
 * They land in `players[]` with every stat at zero, so counting them makes
 * every squad average (boon uptime, DPS, cleanses) divide a real numerator
 * by an inflated denominator. On the reference captures that is 1–4 people
 * per fight, and 2 of 5 on one small one.
 *
 * The test is deliberately the WHOLE surface, not "dealt no damage": a
 * dedicated healer or boon support can finish a fight at zero damage and
 * zero damage taken while carrying the squad, and must never be scored as
 * absent. Anything at all — a dodge, a block, one point of barrier, one
 * second of boon output — makes a person present. Only a row that is zero
 * everywhere is someone the fight did not happen to.
 *
 * GW2EI drops some of these from `players[]` outright, but its rule is
 * agent-bookkeeping (aware windows), not a stat test: on `20260117-180135`
 * EI and this predicate each remove four people, agreeing on three. Parity
 * with EI is therefore not the goal and is not claimed — this is a
 * self-consistent rule about what belongs in a denominator.
 *
 * An entry carrying NONE of these fields is treated as active, not idle.
 * "Every stat is zero" and "this payload does not report stats" look
 * identical field-by-field, and reading the second as the first would empty
 * the squad — and every squad count with it — for any log shape that omits
 * the surface. Absence of evidence is not evidence of absence.
 */
export const isCombatInactiveEntry = (player: any): boolean => {
    const anyNonZero = (value: any): boolean => {
        if (value == null) return false;
        if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
        if (Array.isArray(value)) return value.some(anyNonZero);
        if (typeof value === 'object') return Object.values(value).some(anyNonZero);
        return false;
    };
    let sawSurface = false;
    for (const field of COMBAT_SURFACE) {
        const value = player?.[field];
        if (value == null) continue;
        sawSurface = true;
        if (anyNonZero(value)) return false;
    }
    return sawSurface;
};


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
 * union-over-the-log: any in-squad entry makes the person a squad member,
 * and any active entry makes the person active (one entry per agent
 * instance means a player who relogs mid-fight has an idle stub alongside
 * their real one). Fake and friendly-NPC entries never count.
 *
 * Allies are NOT split on activity: their count is a headcount of who was
 * on the map, and no average divides by it.
 */
export const partitionSquadPlayers = (players: any): SquadPartition => {
    const list: any[] = Array.isArray(players) ? players : [];
    type Bucket = { primary: any; primaryActive: number; inSquad: boolean; active: boolean };
    const byKey = new Map<string, Bucket>();
    const keyless: Bucket[] = [];
    list.forEach((p) => {
        if (!p || p.isFake || p.friendlyNPC) return;
        const bucket: Bucket = {
            primary: p,
            primaryActive: getActiveTime(p),
            inSquad: !p.notInSquad,
            active: !isCombatInactiveEntry(p),
        };
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
        existing.active = existing.active || bucket.active;
        if (bucket.primaryActive > existing.primaryActive) {
            existing.primary = bucket.primary;
            existing.primaryActive = bucket.primaryActive;
        }
    });
    const squadPrimaries: any[] = [];
    const idleSquadPrimaries: any[] = [];
    const pugPrimaries: any[] = [];
    [...byKey.values(), ...keyless].forEach((bucket) => {
        if (!bucket.inSquad) {
            pugPrimaries.push(bucket.primary);
            return;
        }
        (bucket.active ? squadPrimaries : idleSquadPrimaries).push(bucket.primary);
    });
    return { squadPrimaries, idleSquadPrimaries, pugPrimaries };
};
