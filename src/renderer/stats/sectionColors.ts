/**
 * Maps nav group IDs and section IDs to their semantic accent colors.
 * Brand-primary groups use the CSS variable; semantic groups use fixed colors.
 */

/**
 * Category-level accent colors (for StatsGroupContainer left-edge border), keyed by
 * the 10 STATS_CATEGORIES ids. Reuses the old group-id values where a category is a
 * direct descendant of an old group (commanders→commander, squad-stats→squad-cohesion,
 * the old catch-all "other"/"map" content→replay); overview/offense/defense/roster are
 * unchanged. boons-strips/support-healing/players are new picks reusing existing
 * section-accent palette colors rather than introducing new ones.
 */
export const GROUP_ACCENT_COLORS: Record<string, string> = {
    overview: 'var(--axi-text-faint)',
    offense: 'var(--section-offense)',
    defense: 'var(--section-defense)',
    'boons-strips': 'var(--section-boon)',
    'support-healing': 'var(--section-support)',
    'squad-cohesion': 'var(--section-offense)',
    commander: 'var(--axi-text-faint)',
    players: 'var(--section-mitigation)',
    roster: 'var(--axi-text-faint)',
    replay: 'var(--axi-text-faint)',
};

/** Section-level accent colors (for SectionPanel header dots) */
export const SECTION_ACCENT_COLORS: Record<string, string> = {
    // Overview group
    'overview': 'var(--axi-text-faint)',
    'fight-breakdown': 'var(--axi-text-faint)',
    'top-players': 'var(--axi-text-faint)',
    'top-skills-outgoing': 'var(--axi-text-faint)',
    'top-skills-incoming': 'var(--axi-text-faint)',
    'squad-composition': 'var(--axi-text-faint)',
    'timeline': 'var(--axi-text-faint)',
    'map-distribution': 'var(--axi-text-faint)',
    // Commander group
    'commander-stats': 'var(--axi-text-faint)',
    'commander-push-timing': 'var(--axi-text-faint)',
    'commander-target-conversion': 'var(--axi-text-faint)',
    'commander-tag-movement': 'var(--axi-text-faint)',
    'commander-tag-death-response': 'var(--axi-text-faint)',
    // Squad Stats group
    'squad-damage-comparison': 'var(--section-offense)',
    'squad-kill-pressure': 'var(--section-offense)',
    'heal-effectiveness': 'var(--section-healing)',
    'squad-tag-distance-deaths': 'var(--section-defense)',
    'on-tag-review': 'var(--section-defense)',
    'squad-distance-to-tag': 'var(--section-defense)',
    'squad-distance-to-tag-visual': 'var(--section-defense)',
    // Roster group
    'attendance-ledger': 'var(--axi-text-faint)',
    'squad-comp-fight': 'var(--axi-text-faint)',
    'fight-comp': 'var(--axi-text-faint)',
    // Offense group
    'offense-detailed': 'var(--section-offense)',
    'damage-modifiers': 'var(--section-offense)',
    'player-breakdown': 'var(--section-offense)',
    'damage-breakdown': 'var(--section-offense)',
    'spike-damage': 'var(--section-offense)',
    'all-damage': 'var(--section-offense)',
    'conditions-outgoing': 'var(--section-offense)',
    // Defense group
    'defense-detailed': 'var(--section-defense)',
    'revive-detail': 'var(--section-defense)',
    'incoming-damage-modifiers': 'var(--section-defense)',
    'incoming-strike-damage': 'var(--section-defense)',
    'defense-mitigation': 'var(--section-mitigation)',
    'boon-strip-comparison': 'var(--section-defense)',
    'boon-output': 'var(--section-boon)',
    'all-boons': 'var(--section-boon)',
    'boon-timeline': 'var(--section-boon)',
    'boon-uptime': 'var(--section-boon)',
    'stab-performance': 'var(--section-boon)',
    'support-detailed': 'var(--section-support)',
    'healing-stats': 'var(--section-healing)',
    'healing-breakdown': 'var(--section-healing)',
    // Other group
    'fight-diff-mode': 'var(--axi-text-faint)',
    'special-buffs': 'var(--axi-text-faint)',
    'sigil-relic-uptime': 'var(--axi-text-faint)',
    'skill-usage': 'var(--axi-text-faint)',
    'apm-stats': 'var(--axi-text-faint)',
    'player-comparison': 'var(--axi-text-faint)',
};
