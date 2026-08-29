/**
 * The heatmap overlay behind the boon drilldown charts, shared by
 * `BoonTimelineSection` and `BoonUptimeSection`.
 *
 * A mode rather than a set of booleans: every overlay paints the same band
 * behind the same line, so they cannot coexist and the exclusivity belongs
 * in the type instead of a runtime rule. `StabPerformanceSection` has its
 * own copy of this idea with a different member set; the two are kept
 * separate because that chart's overlays are party-scoped, not squad-scoped.
 */
export type BoonHeatmapOverlay = 'none' | 'incoming-damage' | 'incoming-strips' | 'incoming-cc';

/**
 * One control per overlay, each toggling only itself — not a single button
 * that cycles through every mode. A cycling button hides the choices behind
 * the one currently showing: the reader cannot see that a strips overlay
 * exists without clicking, cannot reach it except through damage, and the
 * label keeps changing to name the state rather than the action. Three
 * always-labelled buttons that light up when active say what is available
 * and what is on, which is how `Deaths` and `Distance` already behave on
 * the Stab Performance drilldown beside this one.
 *
 * Selecting a mode still deselects the others — the exclusivity lives in
 * the type, since every overlay paints the same band behind the same line.
 */
export const toggleBoonHeatmapOverlay = (
    mode: BoonHeatmapOverlay,
    target: Exclude<BoonHeatmapOverlay, 'none'>,
): BoonHeatmapOverlay => (mode === target ? 'none' : target);

/**
 * Intensity -> band alpha. The floor keeps a bucket with any activity
 * visibly distinct from an empty one, which a bare linear ramp loses at the
 * bottom of the range.
 */
export const boonHeatmapAlpha = (intensity: number): number => (
    0.06 + (0.52 * Math.max(0, Math.min(1, Number(intensity) || 0)))
);

/**
 * Damage reds vs. strip reds vs. CC amber — the three bands must not be
 * mistaken for each other. The CC amber is `#f59e0b`, the same accent the CC
 * Timeline section shades its grid with, so the two surfaces read as the same
 * measure seen two ways.
 */
export const BOON_HEATMAP_DAMAGE_RGB = '239, 68, 68';
export const BOON_HEATMAP_STRIPS_RGB = '248, 113, 113';
export const BOON_HEATMAP_CC_RGB = '245, 158, 11';
