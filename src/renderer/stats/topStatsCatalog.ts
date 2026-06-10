// src/renderer/stats/topStatsCatalog.ts
import {
  Activity, Ban, Crosshair, Crown, Flame, Hammer, HelpingHand, Heart,
  Shield, ShieldCheck, Swords, Wind, Zap, type LucideIcon,
} from 'lucide-react';

export type TopStatCategory = 'offense' | 'defense' | 'control' | 'utility' | 'boon';

export type TopStatSource =
  | { kind: 'leaderboard'; key: string }
  | { kind: 'boon'; boonId: string; stacking: boolean };

export interface TopStatDef {
  id: string;
  label: string;
  category: TopStatCategory;
  color: string;          // hex accent used by chip + card
  icon: LucideIcon | 'boon';
  unit?: string;
  higherIsBetter: boolean;
  source: TopStatSource;
  defaultOn: boolean;
  supportsRate: boolean;  // per-second/per-minute applies
}

// GW2 boon skill ids (see src/shared/replayBuffs.ts)
export const BOON_IDS = {
  might: 'b740', quickness: 'b1187', alacrity: 'b30328', fury: 'b725',
  protection: 'b717', resistance: 'b26980', resolution: 'b31484',
  stability: 'b1122', aegis: 'b873', regeneration: 'b718', swiftness: 'b719',
} as const;

const CAT_COLOR: Record<TopStatCategory, string> = {
  offense: '#fb923c', defense: '#34d399', control: '#f472b6',
  utility: '#818cf8', boon: '#22d3ee',
};

const lb = (key: string): TopStatSource => ({ kind: 'leaderboard', key });
const boon = (boonId: string, stacking: boolean): TopStatSource => ({ kind: 'boon', boonId, stacking });

export const TOP_STATS_CATALOG: TopStatDef[] = [
  // Offense
  { id: 'dps', label: 'DPS', category: 'offense', color: CAT_COLOR.offense, icon: Swords, higherIsBetter: true, source: lb('dps'), defaultOn: false, supportsRate: true },
  { id: 'damage', label: 'Damage', category: 'offense', color: CAT_COLOR.offense, icon: Flame, higherIsBetter: true, source: lb('damage'), defaultOn: false, supportsRate: true },
  { id: 'downContrib', label: 'Down Contribution', category: 'offense', color: '#f87171', icon: HelpingHand, higherIsBetter: true, source: lb('downContrib'), defaultOn: true, supportsRate: true },
  // Defense / Support
  { id: 'healing', label: 'Healing', category: 'defense', color: CAT_COLOR.defense, icon: Activity, higherIsBetter: true, source: lb('healing'), defaultOn: true, supportsRate: true },
  { id: 'downedHealing', label: 'Downed Healing', category: 'defense', color: CAT_COLOR.defense, icon: Heart, higherIsBetter: true, source: lb('downedHealing'), defaultOn: false, supportsRate: true },
  { id: 'barrier', label: 'Barrier', category: 'defense', color: '#facc15', icon: Shield, higherIsBetter: true, source: lb('barrier'), defaultOn: true, supportsRate: true },
  { id: 'cleanses', label: 'Cleanses', category: 'defense', color: '#60a5fa', icon: Flame, higherIsBetter: true, source: lb('cleanses'), defaultOn: true, supportsRate: true },
  { id: 'strips', label: 'Strips', category: 'defense', color: '#a78bfa', icon: Zap, higherIsBetter: true, source: lb('strips'), defaultOn: true, supportsRate: true },
  { id: 'stability', label: 'Stability Gen', category: 'defense', color: '#22d3ee', icon: ShieldCheck, higherIsBetter: true, source: lb('stability'), defaultOn: true, supportsRate: true },
  { id: 'revives', label: 'Revives', category: 'defense', color: CAT_COLOR.defense, icon: HelpingHand, higherIsBetter: true, source: lb('revives'), defaultOn: false, supportsRate: true },
  // Control
  { id: 'cc', label: 'CC', category: 'control', color: CAT_COLOR.control, icon: Hammer, higherIsBetter: true, source: lb('cc'), defaultOn: true, supportsRate: true },
  { id: 'interrupts', label: 'Interrupts', category: 'control', color: '#fb923c', icon: Ban, higherIsBetter: true, source: lb('interrupts'), defaultOn: false, supportsRate: true },
  { id: 'ccAndInterrupts', label: 'CC + Interrupts', category: 'control', color: CAT_COLOR.control, icon: Hammer, higherIsBetter: true, source: lb('ccAndInterrupts'), defaultOn: false, supportsRate: true },
  // Utility
  { id: 'dodges', label: 'Dodges', category: 'utility', color: '#22d3ee', icon: Wind, higherIsBetter: true, source: lb('dodges'), defaultOn: true, supportsRate: true },
  { id: 'closestToTag', label: 'Closest to Tag', category: 'utility', color: '#818cf8', icon: Crosshair, unit: 'dist', higherIsBetter: false, source: lb('closestToTag'), defaultOn: true, supportsRate: false },
  { id: 'participation', label: 'Participation', category: 'utility', color: CAT_COLOR.utility, icon: Crown, higherIsBetter: true, source: lb('participation'), defaultOn: false, supportsRate: false },
  // Boons (squad generation output; stacking => avg stacks, else uptime %)
  { id: 'boon:might', label: 'Might', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'avg stacks', higherIsBetter: true, source: boon(BOON_IDS.might, true), defaultOn: false, supportsRate: false },
  { id: 'boon:quickness', label: 'Quickness', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.quickness, false), defaultOn: false, supportsRate: false },
  { id: 'boon:alacrity', label: 'Alacrity', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.alacrity, false), defaultOn: false, supportsRate: false },
  { id: 'boon:fury', label: 'Fury', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.fury, false), defaultOn: false, supportsRate: false },
  { id: 'boon:protection', label: 'Protection', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.protection, false), defaultOn: false, supportsRate: false },
  { id: 'boon:resistance', label: 'Resistance', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.resistance, false), defaultOn: false, supportsRate: false },
  { id: 'boon:resolution', label: 'Resolution', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.resolution, false), defaultOn: false, supportsRate: false },
  { id: 'boon:stability', label: 'Stability', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'avg stacks', higherIsBetter: true, source: boon(BOON_IDS.stability, true), defaultOn: false, supportsRate: false },
  { id: 'boon:aegis', label: 'Aegis', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.aegis, false), defaultOn: false, supportsRate: false },
  { id: 'boon:regeneration', label: 'Regeneration', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.regeneration, false), defaultOn: false, supportsRate: false },
  { id: 'boon:swiftness', label: 'Swiftness', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.swiftness, false), defaultOn: false, supportsRate: false },
];

export const DEFAULT_ENABLED_TOP_STATS: string[] = TOP_STATS_CATALOG
  .filter((d) => d.defaultOn)
  .map((d) => d.id);

const VALID_IDS = new Set(TOP_STATS_CATALOG.map((d) => d.id));

export const normalizeEnabledTopStats = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [...DEFAULT_ENABLED_TOP_STATS];
  return value.filter((id): id is string => typeof id === 'string' && VALID_IDS.has(id));
};

export const CATEGORY_ORDER: TopStatCategory[] = ['offense', 'defense', 'control', 'utility', 'boon'];

export const CATEGORY_META: Record<TopStatCategory, { label: string; color: string }> = {
  offense: { label: 'Offense', color: CAT_COLOR.offense },
  defense: { label: 'Defense / Support', color: CAT_COLOR.defense },
  control: { label: 'Control', color: CAT_COLOR.control },
  utility: { label: 'Utility', color: CAT_COLOR.utility },
  boon: { label: 'Boons', color: CAT_COLOR.boon },
};
