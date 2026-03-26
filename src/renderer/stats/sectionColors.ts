/**
 * Maps nav group IDs and section IDs to their semantic accent colors.
 * Brand-primary groups use the CSS variable; semantic groups use fixed colors.
 */

/** Group-level accent colors (for StatsGroupContainer left-edge border) */
export const GROUP_ACCENT_COLORS: Record<string, string> = {
    overview: 'var(--brand-primary)',
    commanders: 'var(--brand-primary)',
    'squad-stats': 'var(--section-offense)',
    roster: 'var(--brand-primary)',
    offense: 'var(--section-offense)',
    defense: 'var(--section-defense)',
    other: 'var(--brand-primary)',
};

/** Section-level accent colors (for SectionPanel header dots) */
export const SECTION_ACCENT_COLORS: Record<string, string> = {
    // Overview group
    'overview': 'var(--brand-primary)',
    'fight-breakdown': 'var(--brand-primary)',
    'top-players': 'var(--brand-primary)',
    'top-skills-outgoing': 'var(--brand-primary)',
    'top-skills-incoming': 'var(--brand-primary)',
    'squad-composition': 'var(--brand-primary)',
    'timeline': 'var(--brand-primary)',
    'map-distribution': 'var(--brand-primary)',
    // Commander group
    'commander-stats': 'var(--brand-primary)',
    'commander-push-timing': 'var(--brand-primary)',
    'commander-target-conversion': 'var(--brand-primary)',
    'commander-tag-movement': 'var(--brand-primary)',
    'commander-tag-death-response': 'var(--brand-primary)',
    // Squad Stats group
    'squad-damage-comparison': 'var(--section-offense)',
    'squad-kill-pressure': 'var(--section-offense)',
    'heal-effectiveness': 'var(--section-healing)',
    'squad-tag-distance-deaths': 'var(--section-defense)',
    // Roster group
    'attendance-ledger': 'var(--brand-primary)',
    'squad-comp-fight': 'var(--brand-primary)',
    'fight-comp': 'var(--brand-primary)',
    // Offense group
    'offense-detailed': 'var(--section-offense)',
    'damage-modifiers': 'var(--section-offense)',
    'player-breakdown': 'var(--section-offense)',
    'damage-breakdown': 'var(--section-offense)',
    'spike-damage': 'var(--section-offense)',
    'conditions-outgoing': 'var(--section-offense)',
    // Defense group
    'defense-detailed': 'var(--section-defense)',
    'incoming-damage-modifiers': 'var(--section-defense)',
    'incoming-strike-damage': 'var(--section-defense)',
    'defense-mitigation': 'var(--section-mitigation)',
    'boon-output': 'var(--section-boon)',
    'boon-timeline': 'var(--section-boon)',
    'boon-uptime': 'var(--section-boon)',
    'support-detailed': 'var(--section-support)',
    'healing-stats': 'var(--section-healing)',
    'healing-breakdown': 'var(--section-healing)',
    // Other group
    'fight-diff-mode': 'var(--brand-primary)',
    'special-buffs': 'var(--brand-primary)',
    'sigil-relic-uptime': 'var(--brand-primary)',
    'skill-usage': 'var(--brand-primary)',
    'apm-stats': 'var(--brand-primary)',
};
