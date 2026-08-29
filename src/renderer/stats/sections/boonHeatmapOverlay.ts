/**
 * The heatmap overlay behind the boon drilldown charts, shared by
 * `BoonTimelineSection` and `BoonUptimeSection`.
 *
 * A mode rather than a set of booleans: every overlay paints the same band
 * behind the same line, so they cannot coexist and the exclusivity belongs
 * in the type instead of a runtime rule. `StabPerformanceSection` has its
 * own copy of this idea with a different member set; the two are kept
 * separate because that chart's overlays are party-scoped, not squad-scoped.
 *
 * There is deliberately no `incoming-cc` member. axilog emits no `cc_taken`
 * lane, so incoming CC does not exist per-bucket at any layer — only the
 * `received_cc_count` scalar in Defense Detailed. Adding the mode before
 * the lane exists would ship a toggle that can only ever say "not recorded".
 */
export type BoonHeatmapOverlay = 'none' | 'incoming-damage' | 'incoming-strips';

export const nextBoonHeatmapOverlay = (mode: BoonHeatmapOverlay): BoonHeatmapOverlay => (
    mode === 'none' ? 'incoming-damage'
        : mode === 'incoming-damage' ? 'incoming-strips'
            : 'none'
);

export const boonHeatmapOverlayLabel = (mode: BoonHeatmapOverlay): string => (
    mode === 'incoming-strips' ? 'Incoming Strips' : 'Incoming Damage'
);

export const boonHeatmapOverlayTitle = (mode: BoonHeatmapOverlay): string => (
    mode === 'none' ? 'Show squad incoming damage intensity overlay'
        : mode === 'incoming-damage' ? 'Show incoming boon strips intensity overlay'
            : 'Hide the intensity overlay'
);

/**
 * Intensity -> band alpha. The floor keeps a bucket with any activity
 * visibly distinct from an empty one, which a bare linear ramp loses at the
 * bottom of the range.
 */
export const boonHeatmapAlpha = (intensity: number): number => (
    0.06 + (0.52 * Math.max(0, Math.min(1, Number(intensity) || 0)))
);

/** Damage reds vs. strip reds — the two bands must not be mistaken for each other. */
export const BOON_HEATMAP_DAMAGE_RGB = '239, 68, 68';
export const BOON_HEATMAP_STRIPS_RGB = '248, 113, 113';
