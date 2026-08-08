import type { ComponentType } from 'react';
import { Trophy, Shield, ShieldAlert, ShieldOff, Zap, Map as MapIcon, Users, Skull, Star, HeartPulse, Keyboard, ListTree, BarChart3, ArrowBigUp, FileText, Swords, GitCompareArrows, Clock3, Target, Route, Waves, Flame, Crosshair, ArrowUpDown, Eraser, Play, LayoutGrid } from 'lucide-react';
import { CommanderTagIcon } from '../ui/CommanderTagIcon';
import { SupportPlusIcon } from '../ui/SupportPlusIcon';
import { Gw2ApmIcon } from '../ui/Gw2ApmIcon';
import { Gw2AegisIcon } from '../ui/Gw2AegisIcon';
import { Gw2BoonIcon } from '../ui/Gw2BoonIcon';
import { Gw2DamMitIcon } from '../ui/Gw2DamMitIcon';
import { Gw2FuryIcon } from '../ui/Gw2FuryIcon';
import { Gw2SigilIcon } from '../ui/Gw2SigilIcon';

export type StatsIcon = ComponentType<{ className?: string }>;

export interface StatsSectionMeta {
    id: string;
    label: string;
    icon: StatsIcon;
    description: string;
    keywords: readonly string[];
}

export interface StatsCategory {
    id: string;
    label: string;
    icon: StatsIcon;
    description: string;
    keywords: readonly string[];
    sections: readonly StatsSectionMeta[];
}

export const STATS_CATEGORIES: readonly StatsCategory[] = [
    {
        id: 'overview', label: 'Overview', icon: Trophy,
        description: 'The raid at a glance — outcomes, KDR, timeline, and standouts.',
        keywords: ['summary', 'kdr', 'kills', 'deaths'],
        sections: [
            { id: 'data-map', label: 'Data Map', icon: LayoutGrid, description: 'Directory of every category and section in this report.', keywords: ['index', 'directory', 'contents', 'guide'] },
            { id: 'overview', label: 'Overview', icon: Trophy, description: 'Kills, deaths, downs, and KDR for the session.', keywords: ['kdr', 'kill death ratio', 'summary'] },
            { id: 'fight-breakdown', label: 'Fight Breakdown', icon: Swords, description: 'Per-fight results: outcome, sizes, kills, and deaths.', keywords: ['fights', 'per fight', 'wins', 'losses'] },
            { id: 'fight-diff-mode', label: 'Fight Comparison', icon: GitCompareArrows, description: 'Compare two fights side by side across metrics.', keywords: ['compare fights', 'diff', 'versus'] },
            { id: 'timeline', label: 'Squad vs Enemy', icon: Users, description: 'Squad and enemy sizes across the session timeline.', keywords: ['squad size', 'enemy size', 'outnumbered'] },
            { id: 'map-distribution', label: 'Map Distribution', icon: MapIcon, description: 'Where the fights happened, by map.', keywords: ['maps', 'borderlands', 'ebg'] },
            { id: 'top-players', label: 'Top Players', icon: Trophy, description: 'Leaderboard of standout performances.', keywords: ['mvp', 'leaderboard', 'best'] },
            { id: 'top-skills-outgoing', label: 'Top Skills', icon: ArrowBigUp, description: 'Highest-impact outgoing skills across the squad.', keywords: ['skills used', 'damage skills'] },
            // No standalone anchor yet — rendered inside TopSkillsSection today; Task 5 creates its own render entry.
            { id: 'top-skills-incoming', label: 'Top Incoming Skills', icon: ArrowBigUp, description: 'Enemy skills that hurt the squad the most.', keywords: ['skills taken', 'incoming skills', 'killed by'] },
        ],
    },
    {
        id: 'offense', label: 'Offense', icon: Swords,
        description: 'Outgoing damage — totals, breakdowns, spikes, modifiers, conditions.',
        keywords: ['damage', 'dps', 'attack'],
        sections: [
            { id: 'offense-detailed', label: 'Offense Detailed', icon: Swords, description: 'Full offensive stat table per player: damage, down contribution, CC, crits.', keywords: ['down contribution', 'cc', 'interrupts', 'critical', 'kills'] },
            { id: 'damage-breakdown', label: 'Damage Breakdown', icon: BarChart3, description: 'Damage split by type and target.', keywords: ['power', 'condition damage'] },
            { id: 'all-damage', label: 'All Damage', icon: Flame, description: 'Total damage view including all sources.', keywords: ['total damage'] },
            { id: 'spike-damage', label: 'Spike Damage', icon: Zap, description: 'Burst windows — who contributes when it matters.', keywords: ['burst', 'spike'] },
            { id: 'damage-modifiers', label: 'Damage Modifiers', icon: Flame, description: 'Outgoing damage modifier uptimes and contributions.', keywords: ['modifiers', 'multipliers'] },
            { id: 'conditions-outgoing', label: 'Conditions', icon: Skull, description: 'Outgoing condition applications per player.', keywords: ['condi', 'burning', 'torment', 'confusion', 'immobilize'] },
        ],
    },
    {
        id: 'defense', label: 'Defense', icon: Shield,
        description: 'Incoming damage and how it was absorbed, avoided, or mitigated.',
        keywords: ['survivability', 'tanking'],
        sections: [
            { id: 'defense-detailed', label: 'Defense Detailed', icon: Shield, description: 'Full defensive stat table: damage taken, downs, deaths, dodges.', keywords: ['damage taken', 'deaths', 'downs', 'dodges'] },
            { id: 'incoming-strike-damage', label: 'Incoming Strike Damage', icon: ShieldAlert, description: 'Incoming pressure over time and per player.', keywords: ['pressure', 'focused'] },
            { id: 'incoming-damage-modifiers', label: 'Incoming Modifiers', icon: ShieldOff, description: 'Incoming damage modifier uptimes.', keywords: ['damage reduction'] },
            { id: 'defense-mitigation', label: 'Damage Mitigation', icon: Gw2DamMitIcon, description: 'Blocks, evades, misses, invulns — avoided damage totals.', keywords: ['blocked', 'evaded', 'mitigated', 'avoided'] },
        ],
    },
    {
        id: 'boons-strips', label: 'Boons & Strips', icon: Gw2BoonIcon,
        description: 'Boon generation, uptime, stability, and boon removal both ways.',
        keywords: ['boons', 'buffs'],
        sections: [
            { id: 'boon-output', label: 'Boon Output', icon: Gw2BoonIcon, description: 'Boon generation per player to squad and subgroup.', keywords: ['might', 'quickness', 'alacrity', 'fury', 'protection', 'regeneration', 'swiftness', 'vigor', 'resistance', 'resolution', 'aegis', 'generation'] },
            { id: 'boon-uptime', label: 'Boon Uptime', icon: Gw2FuryIcon, description: 'Boon uptime percentages across the squad.', keywords: ['uptime'] },
            { id: 'all-boons', label: 'All Boons', icon: Gw2BoonIcon, description: 'Every boon in one combined table.', keywords: ['boon table'] },
            { id: 'boon-timeline', label: 'Boon Timeline', icon: Gw2AegisIcon, description: 'Boon coverage over the course of each fight.', keywords: ['timeline', 'coverage'] },
            { id: 'stab-performance', label: 'Stab Performance', icon: Shield, description: 'Stability coverage in the moments it matters.', keywords: ['stability', 'stab'] },
            { id: 'boon-strip-comparison', label: 'Boon Strips', icon: Eraser, description: 'Strips and corrupts — squad versus enemy.', keywords: ['strips', 'corrupts', 'removal'] },
            { id: 'strip-spikes', label: 'Strip Spikes', icon: Eraser, description: 'Strip burst windows and down contribution from strips.', keywords: ['strip burst'] },
        ],
    },
    {
        id: 'support-healing', label: 'Support & Healing', icon: SupportPlusIcon,
        description: 'Cleanses, stun breaks, resurrects, healing, and barrier.',
        keywords: ['support', 'healer'],
        sections: [
            { id: 'support-detailed', label: 'Support Detailed', icon: SupportPlusIcon, description: 'Cleanses, strips, stun breaks, and resurrects per player.', keywords: ['cleanses', 'condition cleanse', 'stun breaks', 'resurrects', 'res'] },
            { id: 'healing-stats', label: 'Healing Stats', icon: HeartPulse, description: 'Healing and barrier output per player.', keywords: ['healing', 'hps', 'barrier'] },
            { id: 'healing-breakdown', label: 'Healing Breakdown', icon: ListTree, description: 'Healing split by skill for each player.', keywords: ['healing skills'] },
            { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves, description: 'How much healing landed versus was wasted.', keywords: ['effective healing', 'overheal'] },
        ],
    },
    {
        id: 'squad-cohesion', label: 'Squad Cohesion', icon: Users,
        description: 'How tightly the squad moved and fought together around the tag.',
        keywords: ['cohesion', 'positioning', 'together'],
        sections: [
            { id: 'on-tag-review', label: 'On Tag Review', icon: Skull, description: 'Death classification: on tag, off tag, and why.', keywords: ['deaths on tag', 'off tag', 'death review'] },
            { id: 'squad-distance-to-tag', label: 'Distance to Tag', icon: Crosshair, description: 'Average distance from the commander per player.', keywords: ['range from tag', 'closest to tag'] },
            { id: 'squad-distance-to-tag-visual', label: 'Distance to Tag Visual', icon: Crosshair, description: 'Visualized tag-distance distributions.', keywords: ['distance chart'] },
            { id: 'squad-tag-distance-deaths', label: 'Tag Distance Deaths', icon: Crosshair, description: 'Deaths correlated with distance from tag.', keywords: ['died far', 'range deaths'] },
            { id: 'squad-kill-pressure', label: 'Kill Pressure', icon: Target, description: 'How well the squad converts pressure into kills.', keywords: ['focus', 'conversion'] },
            { id: 'squad-damage-comparison', label: 'Damage Comparison', icon: ArrowUpDown, description: 'Squad versus enemy damage exchanged per fight.', keywords: ['squad vs enemy damage'] },
        ],
    },
    {
        id: 'commander', label: 'Commander', icon: CommanderTagIcon,
        description: 'Tag-centric performance: pushes, conversions, movement, responses.',
        keywords: ['tag', 'driver', 'com'],
        sections: [
            { id: 'commander-stats', label: 'Commander Stats', icon: CommanderTagIcon, description: 'Core stats for each commander session.', keywords: ['commander'] },
            { id: 'commander-push-timing', label: 'Push Timing', icon: Clock3, description: 'How quickly pushes were called and executed.', keywords: ['engage', 'push'] },
            { id: 'commander-target-conversion', label: 'Target Conversion', icon: Target, description: 'Called targets converted into downs and kills.', keywords: ['calls', 'target calls'] },
            { id: 'commander-tag-movement', label: 'Tag Movement', icon: Route, description: 'Movement patterns of the tag across fights.', keywords: ['kiting', 'pathing'] },
            { id: 'commander-tag-death-response', label: 'Tag Death Response', icon: Skull, description: 'What the squad did when the tag went down.', keywords: ['tag died', 'response'] },
        ],
    },
    {
        id: 'players', label: 'Players', icon: Users,
        description: 'Individual performance: drilldowns, comparisons, APM, and gear.',
        keywords: ['player', 'individual', 'me'],
        sections: [
            { id: 'player-breakdown', label: 'Player Breakdown', icon: ListTree, description: 'Per-player skill damage drilldown.', keywords: ['per player', 'drilldown', 'my stats'] },
            { id: 'player-comparison', label: 'Player Comparison', icon: Users, description: 'Compare two players side by side.', keywords: ['compare players', 'versus'] },
            { id: 'apm-stats', label: 'APM Breakdown', icon: Gw2ApmIcon, description: 'Actions per minute with and without autos/procs.', keywords: ['actions per minute', 'casts', 'apm'] },
            { id: 'skill-usage', label: 'Skill Usage', icon: Keyboard, description: 'Cast counts per skill per player.', keywords: ['rotations', 'casts', 'skill counts'] },
            { id: 'sigil-relic-uptime', label: 'Sigil/Relic Uptime', icon: Gw2SigilIcon, description: 'Gear proc and sigil/relic uptimes.', keywords: ['gear', 'sigils', 'relics'] },
            { id: 'special-buffs', label: 'Special Buffs', icon: Star, description: 'Food, utilities, and special buff coverage.', keywords: ['food', 'utility', 'consumables'] },
        ],
    },
    {
        id: 'roster', label: 'Roster', icon: FileText,
        description: 'Who showed up, on what class, and how composition shifted.',
        keywords: ['attendance', 'composition', 'squad'],
        sections: [
            { id: 'attendance-ledger', label: 'Attendance Ledger', icon: FileText, description: 'Participation ledger across the session.', keywords: ['attendance', 'showed up', 'participation'] },
            { id: 'squad-composition', label: 'Classes', icon: Users, description: 'Profession distribution of the squad.', keywords: ['professions', 'classes', 'comp'] },
            { id: 'squad-comp-fight', label: 'Squad Comp by Fight', icon: Users, description: 'Composition fight by fight.', keywords: ['comp per fight'] },
            { id: 'fight-comp', label: 'Fight Comp', icon: Swords, description: 'Squad and enemy composition for each fight.', keywords: ['enemy comp'] },
        ],
    },
    {
        id: 'replay', label: 'Replay', icon: Play,
        description: 'Animated map replay of every fight with positions and events.',
        keywords: ['map', 'positions', 'playback'],
        sections: [
            { id: 'replay', label: 'Replay', icon: Play, description: 'Fight-by-fight animated positional replay.', keywords: ['replay', 'movie', 'movement'] },
        ],
    },
];

export const ALL_SECTION_IDS: readonly string[] = STATS_CATEGORIES.flatMap((c) => c.sections.map((s) => s.id));

export const SECTION_TO_CATEGORY: ReadonlyMap<string, string> = new Map(
    STATS_CATEGORIES.flatMap((c) => c.sections.map((s) => [s.id, c.id] as const))
);

// Anchors that are not (or are no longer) real section ids.
// Old group anchors point at the first section of the nearest new home.
export const LEGACY_ALIASES: ReadonlyMap<string, string> = new Map([
    ['kdr', 'overview'],
    ['report-top', 'overview'],
    ['commanders', 'commander-stats'],
    ['squad-stats', 'squad-damage-comparison'],
    ['roster', 'attendance-ledger'],
    ['other', 'fight-diff-mode'],
    ['map', 'replay'],
]);

export function getCategory(categoryId: string): StatsCategory | undefined {
    return STATS_CATEGORIES.find((c) => c.id === categoryId);
}

export function resolveSectionTarget(anchor: string): { categoryId: string; sectionId: string } | null {
    let raw = (anchor || '').replace(/^#/, '').trim();
    if (!raw) return null;
    try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
    const normalized = raw.toLowerCase();

    const aliased = LEGACY_ALIASES.get(normalized);
    const sectionId = aliased ?? normalized;

    const categoryId = SECTION_TO_CATEGORY.get(sectionId);
    if (categoryId) return { categoryId, sectionId };

    // Category anchors (e.g. '#offense') land on the category's first real section
    // ('data-map' is skipped so '#overview'-adjacent anchors go to actual content).
    const category = getCategory(normalized);
    if (category) {
        const first = category.sections.find((s) => s.id !== 'data-map') ?? category.sections[0];
        if (first) return { categoryId: category.id, sectionId: first.id };
    }
    return null;
}
