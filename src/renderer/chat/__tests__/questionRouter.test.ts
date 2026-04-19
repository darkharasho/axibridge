import { describe, it, expect } from 'vitest';
import { classifyQuestion } from '../questionRouter';

describe('incoming_skill_damage', () => {
    const cases = [
        'what was our top incoming skill?',
        'what was our top incoming damage skill?',
        'what hit us the most?',
        'what skill killed us the most?',
        'what enemy attack damaged our squad the most?',
        'top incoming attack',
        'which ability hurt us most?',
        'what were the top incoming skills in fight 2?',
    ];
    it.each(cases)('routes "%s" to incoming_skill_damage', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('incoming_skill_damage');
    });

    it('extracts fight_index from "fight 2"', () => {
        const r = classifyQuestion('what was the top incoming skill in fight 2?');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.args.fight_index).toBe(1);
    });

    it('extracts top_n from "top 5"', () => {
        const r = classifyQuestion('top 5 incoming skills');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.args.top_n).toBe(5);
    });
});

describe('rank_players', () => {
    const cases = [
        ['who had the most damage?', 'damage'],
        ['who topped damage?', 'damage'],
        ['who died the most?', 'deaths'],
        ['who had the best dps?', 'dps'],
        ['who took the most damage?', 'damage_taken'],
        ['who had the most cleanses?', 'cleanses'],
        ['who stripped the most boons?', 'strips'],
    ];
    it.each(cases)('routes "%s" to rank_players with metric %s', (q, metric) => {
        const r = classifyQuestion(q as string);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') {
            expect(r.tool).toBe('rank_players');
            expect(r.args.metric).toBe(metric);
            expect(r.argsComplete).toBe(true);
        }
    });

    it('returns argsComplete: false when metric is ambiguous', () => {
        const r = classifyQuestion('who was the best player?');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') {
            expect(r.tool).toBe('rank_players');
            expect(r.argsComplete).toBe(false);
        }
    });
});

describe('boon_analysis', () => {
    const cases = [
        'how was our boon coverage?',
        'overall boon uptime?',
        'how was our stability uptime?',
        'quickness coverage across the squad',
        'boon analysis for tonight',
    ];
    it.each(cases)('routes "%s" to boon_analysis', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('boon_analysis');
    });

    it('extracts specific boon name', () => {
        const r = classifyQuestion('how was our stability uptime?');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.args.boon_name).toBe('stability');
    });
});

describe('group_breakdown', () => {
    const cases = [
        'how did each group do?',
        'group breakdown for fight 1',
        'how did G1 perform?',
        'compare groups',
        'subgroup performance',
    ];
    it.each(cases)('routes "%s" to group_breakdown', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('group_breakdown');
    });
});

describe('compare_fights', () => {
    const cases = [
        'compare damage across fights',
        'how did our dps change across fights?',
        'fight 1 vs fight 2 deaths',
        'which fight had the most kills?',
    ];
    it.each(cases)('routes "%s" to compare_fights', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('compare_fights');
    });
});

describe('player_deep_dive', () => {
    it('routes GW2 account name to player_deep_dive', () => {
        const r = classifyQuestion('tell me about alice.1234');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') {
            expect(r.tool).toBe('player_deep_dive');
            expect(r.args.character_name).toBe('alice.1234');
        }
    });

    it('routes "how did X do" pattern to player_deep_dive', () => {
        const r = classifyQuestion('how did alice.1234 do tonight?');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('player_deep_dive');
    });
});

describe('context', () => {
    const cases = [
        'did we win?',
        'did we wipe?',
        'what was the outcome of the fight?',
        'how many deaths did we have?',
        'how long was the fight?',
        'what is our K/D?',
        'how many fights do we have loaded?',
    ];
    it.each(cases)('routes "%s" to context', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('context');
    });
});

describe('unavailable', () => {
    const cases = [
        ['what rotation should I use?', 'rotation'],
        ['what build should I play?', 'build'],
        ['how many rallies did we get?', 'rally'],
    ];
    it.each(cases)('routes "%s" to unavailable', (q, _reason) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('unavailable');
    });
});

describe('unknown', () => {
    const cases = [
        'summarize tonight\'s fights',
        'what should we improve on?',
        'give me a general analysis',
        'how was tonight overall?',
    ];
    it.each(cases)('routes "%s" to unknown', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('unknown');
    });
});

describe('squad_skill_damage', () => {
    const cases = [
        'what was our top damage skill?',
        'which skill did the most damage for us?',
        'skill breakdown for tonight',
        'outgoing skill damage',
        'what skills did we use the most?',
        'top skills by down contribution',
    ];
    it.each(cases)('routes "%s" to squad_skill_damage', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('squad_skill_damage');
    });

    it('sets metric: down_contribution when asked', () => {
        const r = classifyQuestion('top skills by down contribution');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.args.metric).toBe('down_contribution');
    });

    it('does NOT match "top incoming skill" (must stay as incoming_skill_damage)', () => {
        const r = classifyQuestion('top incoming skill damage');
        if (r.kind === 'tool') expect(r.tool).toBe('incoming_skill_damage');
    });
});

describe('healing_stats', () => {
    const cases = [
        'who healed the most?',
        'how was our healing?',
        'top healer tonight',
        'healing output breakdown',
        'what was our HPS?',
        'how much barrier did we generate?',
    ];
    it.each(cases)('routes "%s" to healing_stats', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('healing_stats');
    });
});

describe('conditions_applied', () => {
    const cases = [
        'what conditions did we apply?',
        'condition damage output',
        'how much burning did we apply?',
        'condi damage breakdown',
        'how much bleeding did we do?',
    ];
    it.each(cases)('routes "%s" to conditions_applied', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('conditions_applied');
    });

    it('extracts specific condition name', () => {
        const r = classifyQuestion('how much burning did we apply?');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.args.condition_name).toBe('burning');
    });
});

describe('damage_mitigation', () => {
    const cases = [
        'who dodged the most?',
        'mitigation stats',
        'how many evades did we get?',
        'who evaded the most hits?',
        'defensive stats breakdown',
    ];
    it.each(cases)('routes "%s" to damage_mitigation', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('damage_mitigation');
    });
});

describe('spike_damage', () => {
    const cases = [
        'who had the biggest hit?',
        'spike damage breakdown',
        'burst damage output',
        'who hit the hardest?',
        'peak hit values',
        'highest single hit',
    ];
    it.each(cases)('routes "%s" to spike_damage', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') expect(r.tool).toBe('spike_damage');
    });
});

describe('performance_analysis', () => {
    const cases = [
        'what can we improve?',
        'give me a coaching report',
        'what were our weaknesses?',
        'performance review for tonight',
        'where did we struggle?',
        'what should we focus on?',
        'how did we do overall?',
        'give us a full analysis',
        'overall performance summary',
        'areas for improvement',
        'how can we get better?',
    ];
    it.each(cases)('routes "%s" to performance_analysis', (q) => {
        const r = classifyQuestion(q);
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') {
            expect(r.tool).toBe('performance_analysis');
            expect(r.argsComplete).toBe(true);
        }
    });

    it('extracts fight_index when specified', () => {
        const r = classifyQuestion('performance review for fight 2');
        expect(r.kind).toBe('tool');
        if (r.kind === 'tool') {
            expect(r.tool).toBe('performance_analysis');
            expect(r.args.fight_index).toBe(1);
        }
    });

    it('does not route "how was tonight overall?" to performance_analysis', () => {
        const r = classifyQuestion('how was tonight overall?');
        expect(r.kind).not.toBe('tool');
    });
});

// Critical: these must NOT route to rank_players
describe('does not misroute skill questions to rank_players', () => {
    const cases = [
        'what was our top incoming skill?',
        'what was the top incoming damage skill?',
        'what hit us the most?',
        'top incoming attack',
    ];
    it.each(cases)('"%s" does NOT route to rank_players', (q) => {
        const r = classifyQuestion(q);
        if (r.kind === 'tool') expect(r.tool).not.toBe('rank_players');
    });
});
