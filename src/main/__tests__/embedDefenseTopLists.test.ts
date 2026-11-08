import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import axios from 'axios';
import { DiscordNotifier } from '../discord';

// Blocks / Evades / Invulns top-10 lists, each behind its own embed toggle.
const player = (account: string, blocked: number, evaded: number, invulned: number, notInSquad = false) => ({
    account,
    name: account,
    profession: 'Guardian',
    notInSquad,
    dpsAll: [{ damage: 1000, dps: 10 }],
    support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, resurrects: 0, resurrectTime: 0 }],
    statsAll: [{ downContribution: 0, killed: 0, downed: 0, distToCom: 0, stackDist: 0 }],
    defenses: [{
        damageTaken: 0, deadCount: 0, downCount: 0, dodgeCount: 0,
        blockedCount: blocked, evadedCount: evaded, invulnedCount: invulned,
    }],
    totalDamageDist: [[]],
});

const details = {
    players: [
        player('Alpha.1', 3, 9, 1),
        player('Bravo.2', 8, 2, 4),
        player('Charlie.3', 1, 1, 12),
        player('Pug.4', 99, 99, 99, true),
    ],
    targets: [],
    phases: [{ start: 0, end: 60000 }],
    durationMS: 60000,
};

const allOff = {
    showSquadSummary: false, showEnemySummary: false, showIncomingStats: false, showClassSummary: false,
    showDamage: false, showDownContribution: false, showHealing: false, showBarrier: false,
    showCleanses: false, showBoonStrips: false, showCC: false, showStability: false,
    showResurrects: false, showDistanceToTag: false, showKills: false, showDowns: false,
    showBreakbarDamage: false, showDamageTaken: false, showDeaths: false, showDodges: false,
    showDamageMitigation: false, showBlocks: false, showEvades: false, showInvulns: false,
    maxTopListRows: 10, classDisplay: 'off', includeMapSlice: false,
};

const fieldsFor = async (overrides: Record<string, boolean>) => {
    const notifier = new DiscordNotifier();
    notifier.setEmbedStatSettings({ ...allOff, ...overrides } as never);
    notifier.setDestinations([{ id: 'w1', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' } as never]);
    await notifier.sendLog({ permalink: 'https://dps.report/abcd', id: 'log-1', filePath: '/tmp/f.zevtc', mode: 'embed' } as never, details);
    const embeds = (vi.mocked(axios.post).mock.calls[0][1] as any).embeds as any[];
    return embeds.flatMap(embed => embed.fields || []);
};

const firstRowAccount = (value: string) => {
    const row = value.split('\n').find(line => /\d/.test(line) && !line.startsWith('```'));
    return row ?? '';
};

describe('embed Blocks / Evades / Invulns top lists', () => {
    beforeEach(() => {
        vi.mocked(axios.post).mockReset();
        vi.mocked(axios.post).mockResolvedValue({ status: 204, data: {} } as never);
    });

    it('omits all three lists while their toggles are off', async () => {
        const names = (await fieldsFor({})).map(f => f.name);
        expect(names.some(n => /Blocks|Evades|Invulns/.test(n))).toBe(false);
    });

    it.each([
        ['showBlocks', 'Blocks', 'Bravo.2'],
        ['showEvades', 'Evades', 'Alpha.1'],
        ['showInvulns', 'Invulns', 'Charlie.3'],
    ])('%s renders a %s list led by the squad leader, never a pug', async (toggle, title, leader) => {
        const fields = await fieldsFor({ [toggle]: true });
        const field = fields.find(f => String(f.name).includes(title));
        expect(field, title).toBeTruthy();
        expect(field.value).not.toContain('Pug');
        expect(firstRowAccount(field.value)).toContain(leader);
    });
});
