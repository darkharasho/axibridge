import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { DiscordNotifier, getSubstitutedLength, trimFieldValueToLength } from '../discord';

const DISCORD_LIMIT = 6000;
const TOKEN = '{{spec:spellbreaker}}';

/** Every live application emoji id is a 19-digit snowflake. */
const substitute = (text: string) =>
    text.replace(/\{\{spec:([a-z0-9]+)\}\}/g, (_m, key) => `<:${key}:1234567890123456789>`);

describe('getSubstitutedLength', () => {
    it('leaves text alone on the webhook path, where nothing substitutes', () => {
        expect(getSubstitutedLength(`${TOKEN} x`, false)).toBe(TOKEN.length + 2);
    });

    it('leaves token-free bridge text alone', () => {
        expect(getSubstitutedLength('Damage:', true)).toBe(7);
    });

    it('budgets each token at its real rendered width', () => {
        // The budget carries one digit of headroom over today's 19-digit ids,
        // so it must never read *under* what the relay actually emits.
        for (const key of ['spellbreaker', 'ranger', 'dragonhunter']) {
            const text = `\` 1\` {{spec:${key}}} \`Name - 1\``;
            expect(getSubstitutedLength(text, true)).toBeGreaterThanOrEqual(substitute(text).length);
        }
    });

    it('scales with the number of tokens, not their keys', () => {
        const one = getSubstitutedLength(TOKEN, true) - TOKEN.length;
        const three = `${TOKEN}${TOKEN}${TOKEN}`;
        expect(getSubstitutedLength(three, true) - three.length).toBe(one * 3);
    });
});

describe('trimFieldValueToLength', () => {
    const rows = Array.from({ length: 5 }, (_, i) => `${TOKEN} row${i}`).join('\n');

    it('returns the value untouched when it already fits', () => {
        expect(trimFieldValueToLength(rows, 10_000, true)).toBe(rows);
    });

    it('sheds whole trailing rows until the substituted value fits', () => {
        const limit = getSubstitutedLength(rows, true) - 1;
        const trimmed = trimFieldValueToLength(rows, limit, true);

        expect(getSubstitutedLength(trimmed, true)).toBeLessThanOrEqual(limit);
        expect(trimmed.split('\n')).toHaveLength(4);
        // A row is never cut mid-token; a half `<:name:` renders as literal text.
        expect(trimmed.split('\n').every(row => row.startsWith(TOKEN))).toBe(true);
    });

    it('drops a fenced value whole rather than shedding its closing fence', () => {
        const fenced = '```\nalpha\nbravo\n```';
        expect(trimFieldValueToLength(fenced, fenced.length - 1, false)).toBe('');
    });

    it('returns empty when no single row fits', () => {
        expect(trimFieldValueToLength(rows, 1, true)).toBe('');
    });
});

const SPECS = [
    'Spellbreaker', 'Elementalist', 'Dragonhunter', 'Chronomancer', 'Scourge', 'Firebrand',
    'Willbender', 'Bladesworn', 'Vindicator', 'Untamed', 'Mechanist', 'Harbinger',
];

// A hostile-but-reachable report: a full squad, long names, and every stat
// list switched on at the maximum row count.
const hostileDetails = {
    players: Array.from({ length: 30 }, (_, i) => ({
        account: `Player${i}.1234`,
        name: `Wwwwwwwwwwwwwwwwwwww${i}`,
        profession: SPECS[i % SPECS.length],
        notInSquad: false,
        dpsAll: [{ damage: 900000 - i, dps: 5000 }],
        stabGeneration: 99 - i,
        support: [{ condiCleanse: 500 - i, condiCleanseSelf: 10, boonStrips: 400 - i, resurrects: 5, resurrectTime: 3 }],
        statsAll: [{ downContribution: 70000 - i, killed: 9, downed: 8, distToCom: 300 + i, stackDist: 300 + i }],
        defenses: [{ damageTaken: 500000 - i, deadCount: 3, downCount: 4, dodgeCount: 20, breakbarDamage: 100, damageBarrier: 1000 }],
        extHealingStats: { outgoingHealing: [{ healing: 50000 - i, hps: 500 }], outgoingHealingAllies: [[{ healing: 50000 - i }]] },
        extBarrierStats: { outgoingBarrier: [{ barrier: 40000 - i }], outgoingBarrierAllies: [[{ barrier: 40000 - i }]] },
        totalDamageDist: [[]],
    })),
    targets: [],
    phases: [{ start: 0, end: 60000 }],
    durationMS: 60000,
};

// The same roster with every countable stat at zero: each top list keeps its
// `enabled` gate but has no qualifying row to render.
const zeroedDetails = {
    ...hostileDetails,
    players: hostileDetails.players.map(player => ({
        ...player,
        dpsAll: [{ damage: 0, dps: 0 }],
        stabGeneration: 0,
        support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, resurrects: 0, resurrectTime: 0 }],
        statsAll: [{ downContribution: 0, killed: 0, downed: 0, distToCom: 0, stackDist: 0 }],
        defenses: [{ damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0, breakbarDamage: 0, damageBarrier: 0 }],
        extHealingStats: { outgoingHealing: [{ healing: 0, hps: 0 }], outgoingHealingAllies: [[{ healing: 0 }]] },
        extBarrierStats: { outgoingBarrier: [{ barrier: 0 }], outgoingBarrierAllies: [[{ barrier: 0 }]] },
    })),
};

const allStatsOn = {
    classDisplay: 'emoji',
    maxTopListRows: 10,
    showDamage: true, showDownContribution: true, showHealing: true, showBarrier: true,
    showCleanses: true, showBoonStrips: true, showCC: true, showStability: true,
    showResurrects: true, showDistanceToTag: true, showKills: true, showDowns: true,
    showBreakbarDamage: true, showDamageTaken: true, showDeaths: true, showDodges: true,
    showDamageMitigation: true,
};

const logData = { permalink: 'https://dps.report/abcd', id: 'log-1', filePath: '/tmp/fight.zevtc', mode: 'embed' as const };

/** What Discord counts: the sum across every embed in the message. */
const messageCharCount = (embeds: any[], render: (text: string) => string) =>
    embeds.reduce((total, embed) => {
        const fields = (embed.fields || []).reduce(
            (sum: number, f: any) => sum + render(f.name || '').length + render(f.value || '').length,
            0,
        );
        return total
            + render(embed.title || '').length
            + render(embed.description || '').length
            + render(embed.footer?.text || '').length
            + fields;
    }, 0);

describe('embed character budget', () => {
    beforeEach(() => {
        vi.mocked(axios.post).mockReset();
        vi.mocked(axios.post).mockResolvedValue({ status: 204, data: {} } as never);
    });

    const send = async (destination: any) => {
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings(allStatsOn as never);
        notifier.setDestination(destination);
        await notifier.sendLog(logData, hostileDetails);
        return (vi.mocked(axios.post).mock.calls[0][1] as any).embeds as any[];
    };

    it('keeps a bridged report inside the limit measured on what the relay actually posts', async () => {
        const embeds = await send({ kind: 'bridge', relayUrl: 'https://bot.example.com', token: 'axb1.x.y' });

        const raw = messageCharCount(embeds, text => text);
        const rendered = messageCharCount(embeds, substitute);

        expect(rendered).toBeLessThanOrEqual(DISCORD_LIMIT);
        // The guard only means something if substitution is what pushes this
        // report over: counting the raw text alone leaves it comfortably under
        // the cap, which is exactly how the tail used to be lost.
        expect(raw).toBeLessThan(DISCORD_LIMIT - 1000);
        expect(rendered).toBeGreaterThan(DISCORD_LIMIT - 500);
    });

    it('spends the budget across every embed rather than per embed', async () => {
        const embeds = await send({ kind: 'bridge', relayUrl: 'https://bot.example.com', token: 'axb1.x.y' });

        // Discord's cap is a whole-message sum, so a second embed must eat into
        // the same budget the first one spent -- never restart it at 6000.
        expect(embeds.length).toBeGreaterThan(1);
        expect(messageCharCount(embeds, substitute)).toBeLessThanOrEqual(DISCORD_LIMIT);
    });

    it('never emits an empty field value for an all-zero board', async () => {
        // Discord rejects a field whose value is the empty string with a 400 for
        // the whole message. The bridge's span layout has no fence to fall back
        // on, so a board every row of which was filtered out lands there unless
        // it is given a placeholder.
        const notifier = new DiscordNotifier();
        notifier.setEmbedStatSettings(allStatsOn as never);
        notifier.setDestination({ kind: 'bridge', relayUrl: 'https://bot.example.com', token: 'axb1.x.y' });
        await notifier.sendLog(logData, zeroedDetails);
        const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds as any[];

        const fields = embeds.flatMap(embed => embed.fields || []);
        expect(fields.length).toBeGreaterThan(0);
        for (const field of fields) {
            expect(field.value).not.toBe('');
        }
    });

    it('never inflates the webhook path, which has no tokens to substitute', async () => {
        const embeds = await send({ kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' });

        expect(JSON.stringify(embeds)).not.toContain('{{spec:');
        expect(messageCharCount(embeds, text => text)).toBeLessThanOrEqual(DISCORD_LIMIT);
    });
});
