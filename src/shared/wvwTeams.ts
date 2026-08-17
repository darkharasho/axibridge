// WvW team → color mapping.
//
// Preferred source: Elite Insights' authoritative `wvWMapData` (built from the
// arcdps CBTS_WVWTEAMS statechange event), which gives the exact red/green/blue
// team ids for the log. Older logs (pre-~May 2026) lack the event, so we fall
// back to the well-known fixed team-id table below.
//
// Fixed table reconciled from two community tools that predate the event:
//   - Drevarr/EVTC_parser/gw2_data.py
//   - Drevarr/GW2_EI_log_combiner/config.py

// Subpath, not the package root: `src/shared/**` is also compiled by
// `electron/tsconfig.json`, whose Node10 resolver cannot see the root `exports`
// map. Every other shared module imports this way for the same reason — see
// `src/main/bridgeMetricsRoot.d.ts`.
import { getEncounterTeamMap } from '@axiapps/bridge-metrics/nativeEncounter';

export type WvwTeamColor = 'red' | 'green' | 'blue' | 'unknown';

/** Authoritative per-log team→color map (0 means that team is absent). */
export interface WvwTeamMap {
  red: number;
  green: number;
  blue: number;
}

const RED_TEAM_IDS: ReadonlySet<number> = new Set([697, 705, 706, 707, 882, 885, 886, 2520, 2543]);
const GREEN_TEAM_IDS: ReadonlySet<number> = new Set([39, 2739, 2741, 2752, 2763, 2767]);
const BLUE_TEAM_IDS: ReadonlySet<number> = new Set([432, 433, 1277, 1282, 1989]);

export const WVW_TEAM_COLOR_META: Record<WvwTeamColor, { label: string; hex: string }> = {
  red: { label: 'Red', hex: '#f87171' },
  green: { label: 'Green', hex: '#4ade80' },
  blue: { label: 'Blue', hex: '#60a5fa' },
  unknown: { label: 'Unknown', hex: '#9ca3af' },
};

export const WVW_TEAM_COLOR_ORDER: WvwTeamColor[] = ['red', 'green', 'blue', 'unknown'];

/**
 * Build a WvwTeamMap from a parsed EI log object. Tolerates both `wvWMapData`
 * and `wvwMapData` casings. Returns null when the log has no team event.
 */
export function teamMapFromLog(log: unknown): WvwTeamMap | null {
  if (!log || typeof log !== 'object') return null;
  const obj = log as Record<string, unknown>;
  const data = (obj.wvWMapData ?? obj.wvwMapData) as
    | { redTeamID?: number; greenTeamID?: number; blueTeamID?: number }
    | undefined;
  const fromEi: WvwTeamMap | null = data && typeof data === 'object'
    ? {
      red: Number(data.redTeamID) || 0,
      green: Number(data.greenTeamID) || 0,
      blue: Number(data.blueTeamID) || 0,
    }
    : null;

  // Native wins outright when present — it is not merged with `wvWMapData`,
  // because a colour EI reports that native does not is a PLACEHOLDER, not a
  // team. `to_ei_json` must fill EI's fixed red/blue/green shape, so when a
  // colour fielded nobody it emits `representative_team_id(colour)` — a
  // hardcoded 697/432/39 (axilog-ei/src/lib.rs:27). The committed fixture has
  // no red player and still reports `redTeamID: 697`. Merging that in would
  // put an id no agent in the log belongs to into the map.
  return getEncounterTeamMap(log) ?? fromEi;
}

/**
 * Resolve a team id to its color. Prefers the authoritative map, then the fixed
 * id-table, else 'unknown'.
 */
export function getWvwTeamColor(
  teamID: number | null | undefined,
  map?: WvwTeamMap | null,
): WvwTeamColor {
  if (typeof teamID !== 'number' || !Number.isFinite(teamID) || teamID <= 0) {
    return 'unknown';
  }
  if (map) {
    if (map.red > 0 && teamID === map.red) return 'red';
    if (map.green > 0 && teamID === map.green) return 'green';
    if (map.blue > 0 && teamID === map.blue) return 'blue';
  }
  if (RED_TEAM_IDS.has(teamID)) return 'red';
  if (GREEN_TEAM_IDS.has(teamID)) return 'green';
  if (BLUE_TEAM_IDS.has(teamID)) return 'blue';
  return 'unknown';
}
