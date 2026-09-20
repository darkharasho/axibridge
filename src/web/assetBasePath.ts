/**
 * Decide where static assets (logos, class icons, `logo.json`) live.
 *
 * On a GitHub Pages report the answer has to be guessed from the URL, so the
 * candidates are probed in order until one answers. Under the share viewer the
 * page is served at `/r/<code>`, which is not a directory at all: every
 * candidate 404s (two of them against the Worker itself), so six guaranteed
 * failures fired on every share view and the resolved base stayed wrong
 * anyway. When the caller knows the real base it passes it explicitly and this
 * returns `probe: false` — the effect must then perform NO fetches.
 *
 * Exported as a pure function so that decision is testable without mounting
 * the whole report.
 */
export const planAssetBaseResolution = (
    opts: { assetBase?: string; basePath: string }
): { candidates: string[]; probe: boolean } => {
    const withTrailingSlash = (value: string) => {
        const normalized = value || '/';
        if (normalized === './' || normalized.endsWith('/')) return normalized;
        return `${normalized}/`;
    };
    if (opts.assetBase) {
        return { candidates: [withTrailingSlash(opts.assetBase)], probe: false };
    }
    const deduped: string[] = [];
    [opts.basePath, './', '/'].forEach((value) => {
        const normalized = withTrailingSlash(value);
        if (!deduped.includes(normalized)) deduped.push(normalized);
    });
    return { candidates: deduped, probe: true };
};

export const ASSET_BASE_PATH_PROBE_PATHS = ['reports/index.json', 'logo.json'] as const;

const joinProbePath = (base: string, probePath: string): string => {
    if (base === './') return `./${probePath}`;
    return `${base}${probePath}`;
};

/**
 * Run the probe described by a plan and return the base that answered, or
 * `null` to keep the first candidate.
 *
 * Performs ZERO fetches when `plan.probe` is false — that is the whole point of
 * an explicit `assetBase`, and it is asserted directly in the tests rather than
 * inferred from the flag.
 */
export const probeAssetBasePath = async (
    plan: { candidates: string[]; probe: boolean },
    fetchImpl: typeof fetch = fetch
): Promise<string | null> => {
    if (!plan.probe) return null;
    for (const candidate of plan.candidates) {
        for (const probePath of ASSET_BASE_PATH_PROBE_PATHS) {
            try {
                const response = await fetchImpl(joinProbePath(candidate, probePath), { cache: 'no-store' });
                if (response.ok) return candidate;
            } catch {
                // Try the next probe path or candidate.
            }
        }
    }
    return null;
};
