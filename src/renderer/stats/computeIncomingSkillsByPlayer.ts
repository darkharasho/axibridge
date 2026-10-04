import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';
import { getFocusLog, hasCastsBySkill } from '@axiapps/bridge-metrics/nativeFocus';
import { canonicalSkillId } from '@axiapps/bridge-metrics';
import { resolveBuffMetaById } from '../../shared/conditionsMetrics';

/**
 * Incoming skills by player — what hit each squad member, and what was aimed
 * at them, broken down by enemy skill.
 *
 * Two measurements from two different event streams, joined on account:
 *
 * - **Damage / hits** come from each player's EI-shaped `totalDamageTaken`,
 *   the strike + condition stream. Every log has it.
 * - **Casts** come from axilog's `blocks.focus.by_entity[].casts_by_skill`, the
 *   enemy cast-start census. It exists only on arcdps builds from May 2026 on,
 *   and only on parses from axilog 1.16.0 on.
 *
 * Neither bounds the other: a skill can be cast at a player and never land,
 * or land without a cast row (instants, untargeted ground AoE). So the casts
 * axis is pooled over the fights that can MEASURE it and the fights that
 * cannot are counted, never folded in as zeros — the same rule Enemy
 * Attention follows, for the same reason.
 */

export type IncomingSkillByPlayerRow = {
    /** Canonical skill id — same-name variants merged, as Top Incoming Skills does. */
    id: number;
    name: string;
    icon?: string;
    damage: number;
    hits: number;
    casts: number;
};

export type IncomingSkillsPlayer = {
    account: string;
    profession: string;
    professionList: string[];
    /** Fights this player took part in. */
    fightCount: number;
    /** Of those, fights whose casts could be measured. */
    castFightCount: number;
    totalDamage: number;
    totalCasts: number;
    skills: IncomingSkillByPlayerRow[];
};

export type IncomingSkillsByPlayerResult = {
    players: IncomingSkillsPlayer[];
    /** Fights that carry the per-skill cast split. */
    castMeasuredFightCount: number;
    /** Fights that do not — too old an arcdps build, or too old a parse. */
    castUnmeasuredFightCount: number;
};

export const EMPTY_INCOMING_SKILLS_BY_PLAYER: IncomingSkillsByPlayerResult = {
    players: [], castMeasuredFightCount: 0, castUnmeasuredFightCount: 0,
};

/** Per-skill rows a player keeps in the finalized result, per metric. */
const MAX_SKILLS_PER_PLAYER = 40;

type SkillTally = { damage: number; hits: number; casts: number };

type IngestPlayer = {
    account: string;
    profession: string;
    /** Keyed by canonical skill id. */
    skills: Record<string, SkillTally>;
};

export type IncomingSkillsByPlayerIngest = {
    castsMeasurable: boolean;
    players: IngestPlayer[];
    /** Name/icon for every skill id this log's players reference. */
    skillMeta: Record<string, { name: string; icon?: string }>;
};

const num = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

const resolveSkillMeta = (details: any, id: number): { name: string; icon?: string } => {
    const mapped = details?.skillMap?.[`s${id}`] || details?.skillMap?.[`${id}`];
    if (mapped?.name) return { name: String(mapped.name), icon: mapped.icon };
    // Cast-only skills -- aimed at the squad, never connected -- can be absent
    // from the EI-shaped skillMap, which is built from damage and rotation.
    const native = details?.native?.catalogs?.skills?.[String(id)];
    if (native?.name) return { name: String(native.name), icon: native.icon || mapped?.icon };
    const buff = resolveBuffMetaById(details?.buffMap, id);
    if (buff?.name) return { name: String(buff.name), icon: buff.icon || mapped?.icon };
    return { name: `Skill ${id}`, icon: mapped?.icon };
};

export const ingestLogIncomingSkillsByPlayer = (log: any): IncomingSkillsByPlayerIngest => {
    const details = log?.details;
    const byAccount = new Map<string, IngestPlayer>();
    const skillMeta: Record<string, { name: string; icon?: string }> = {};

    const tally = (account: string, profession: string, rawId: unknown): SkillTally | null => {
        const id = Number(rawId);
        if (!Number.isFinite(id) || id <= 0) return null;
        const key = String(canonicalSkillId(details, id));
        if (!skillMeta[key]) skillMeta[key] = resolveSkillMeta(details, Number(key));
        let player = byAccount.get(account);
        if (!player) {
            player = { account, profession, skills: {} };
            byAccount.set(account, player);
        }
        return (player.skills[key] ||= { damage: 0, hits: 0, casts: 0 });
    };

    const players = Array.isArray(details?.players) ? details.players : [];
    for (const p of players) {
        if (!p || p.notInSquad) continue;
        const account = String(p.account || p.name || '');
        if (!account) continue;
        const profession = String(p.profession || 'Unknown');
        if (!byAccount.has(account)) byAccount.set(account, { account, profession, skills: {} });
        const groups = Array.isArray(p.totalDamageTaken) ? p.totalDamageTaken : [];
        for (const group of groups) {
            if (!Array.isArray(group)) continue;
            for (const entry of group) {
                const t = tally(account, profession, entry?.id);
                if (!t) continue;
                t.damage += num(entry?.totalDamage);
                t.hits += num(entry?.hits);
            }
        }
    }

    // A pre-rework log, or a parse from before axilog emitted the split, cannot
    // say which skills were aimed at whom. Reported as unmeasurable rather than
    // as a log in which nothing was cast.
    const focus = getFocusLog(details);
    const castsMeasurable = !!focus && hasCastsBySkill(focus);
    if (focus && castsMeasurable) {
        for (const entity of squadEntities(details?.native ?? {})) {
            const row = focus.rows.get(entity.id);
            if (!row || row.castsBySkill.length === 0) continue;
            const account = String(entity?.account || '');
            if (!account) continue;
            const profession = byAccount.get(account)?.profession || 'Unknown';
            for (const { skill, casts } of row.castsBySkill) {
                const t = tally(account, profession, skill);
                if (t) t.casts += casts;
            }
        }
    }

    return { castsMeasurable, players: [...byAccount.values()], skillMeta };
};

/** Top rows by damage, plus top rows by casts, so either toggle has a full list. */
const keepTopSkills = (rows: IncomingSkillByPlayerRow[]): IncomingSkillByPlayerRow[] => {
    if (rows.length <= MAX_SKILLS_PER_PLAYER) return rows;
    const keep = new Set<IncomingSkillByPlayerRow>();
    [...rows].sort((a, b) => b.damage - a.damage).slice(0, MAX_SKILLS_PER_PLAYER).forEach(r => keep.add(r));
    [...rows].sort((a, b) => b.casts - a.casts).slice(0, MAX_SKILLS_PER_PLAYER).forEach(r => keep.add(r));
    return rows.filter(r => keep.has(r));
};

export const finalizeIncomingSkillsByPlayer = (
    ingests: IncomingSkillsByPlayerIngest[],
): IncomingSkillsByPlayerResult => {
    let castMeasuredFightCount = 0;
    let castUnmeasuredFightCount = 0;
    const meta: Record<string, { name: string; icon?: string }> = {};
    const byAccount = new Map<string, {
        professions: Map<string, number>;
        fightCount: number;
        castFightCount: number;
        skills: Map<string, SkillTally>;
    }>();

    for (const ingest of ingests) {
        if (!ingest) continue;
        if (ingest.castsMeasurable) castMeasuredFightCount += 1; else castUnmeasuredFightCount += 1;
        for (const [key, m] of Object.entries(ingest.skillMeta || {})) {
            const existing = meta[key];
            // Prefer a resolved name over the `Skill <id>` placeholder.
            if (!existing || (existing.name.startsWith('Skill ') && !m.name.startsWith('Skill '))) {
                meta[key] = { name: m.name, icon: m.icon || existing?.icon };
            } else if (!existing.icon && m.icon) {
                existing.icon = m.icon;
            }
        }
        for (const p of ingest.players || []) {
            let acc = byAccount.get(p.account);
            if (!acc) {
                acc = { professions: new Map(), fightCount: 0, castFightCount: 0, skills: new Map() };
                byAccount.set(p.account, acc);
            }
            acc.fightCount += 1;
            if (ingest.castsMeasurable) acc.castFightCount += 1;
            acc.professions.set(p.profession, (acc.professions.get(p.profession) ?? 0) + 1);
            for (const [key, t] of Object.entries(p.skills || {})) {
                const s = acc.skills.get(key) || { damage: 0, hits: 0, casts: 0 };
                s.damage += t.damage;
                s.hits += t.hits;
                s.casts += t.casts;
                acc.skills.set(key, s);
            }
        }
    }

    const players: IncomingSkillsPlayer[] = [];
    for (const [account, acc] of byAccount) {
        const professionList = [...acc.professions.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name]) => name);
        let totalDamage = 0;
        let totalCasts = 0;
        const rows: IncomingSkillByPlayerRow[] = [];
        for (const [key, s] of acc.skills) {
            if (s.damage <= 0 && s.casts <= 0) continue;
            totalDamage += s.damage;
            totalCasts += s.casts;
            const m = meta[key] || { name: `Skill ${key}` };
            rows.push({ id: Number(key), name: m.name, icon: m.icon, ...s });
        }
        rows.sort((a, b) => b.damage - a.damage || b.casts - a.casts || a.name.localeCompare(b.name));
        players.push({
            account,
            profession: professionList[0] ?? 'Unknown',
            professionList,
            fightCount: acc.fightCount,
            castFightCount: acc.castFightCount,
            totalDamage,
            totalCasts,
            skills: keepTopSkills(rows),
        });
    }
    players.sort((a, b) => b.totalDamage - a.totalDamage || a.account.localeCompare(b.account));
    return { players, castMeasuredFightCount, castUnmeasuredFightCount };
};
