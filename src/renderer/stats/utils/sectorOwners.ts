// Zone-colour ownership helpers: match picker options (Task 4) and the
// per-log sector ownership snapshot (Task 5).

const REGION_NAMES: Record<string, string> = { '1': 'NA', '2': 'EU' };

export function buildWvwMatchOptions(ids: string[]): { value: string; label: string }[] {
    return ids
        .map(id => {
            const m = /^([12])-(\d+)$/.exec(id);
            return m ? { value: id, region: Number(m[1]), tier: Number(m[2]) } : null;
        })
        .filter((v): v is { value: string; region: number; tier: number } => v !== null)
        .sort((a, b) => a.region - b.region || a.tier - b.tier)
        .map(v => ({ value: v.value, label: `${REGION_NAMES[String(v.region)]} — Tier ${v.tier}` }));
}
