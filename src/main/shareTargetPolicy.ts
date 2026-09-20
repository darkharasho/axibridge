/**
 * Where share links are allowed to store bytes, and what that means for
 * dps.report.
 *
 * These are pure functions over the settings store, deliberately kept out of
 * `githubHandlers` (which imports `electron` and cannot be unit-tested without
 * mocking the whole app shell). Whether R2 is connected is passed IN as
 * `hasR2` rather than resolved here, so this module depends on nothing.
 */

/**
 * The repo that holds individual fight reports.
 *
 * Deliberately NOT the reports repo. A session report is one artifact published
 * on demand; a share is one artifact per fight, so mixing them would push the
 * reports repo toward the ~1 GB Pages ceiling at a rate the user never chose,
 * and retention would have to distinguish two kinds of content in one index.
 * Separate repos keep each one's budget its own.
 *
 * Derived from the reports repo name so two AxiBridge installs pointed at
 * different report repos do not collide on one shared fights repo.
 */
export const fightsRepoName = (store: any): string | null => {
    const explicit = (store?.get?.('githubFightsRepoName') as string | undefined)?.trim();
    if (explicit) return explicit;
    const reports = (store?.get?.('githubRepoName') as string | undefined)?.trim();
    return reports ? `${reports}-fights` : null;
};

/**
 * Whether sharing has somewhere to write, answered WITHOUT a network call.
 *
 * `resolveShareTarget` may create a repo and enable Pages, so it cannot be used
 * to make a decision on the hot ingest path. This is the cheap predicate that
 * can: it asks only what the store already knows. It may say yes and the later
 * `resolveShareTarget` still fail (revoked token, GitHub outage) — callers must
 * treat it as "worth attempting", not as a guarantee.
 */
export const shareTargetConfigured = (store: any, hasR2: boolean): boolean => {
    if (hasR2) return true;
    const token = store?.get?.('githubToken') as string | undefined;
    return Boolean(token && token.trim() && fightsRepoName(store));
};

/**
 * Whether to keep uploading this log to dps.report for a permalink.
 *
 * Share links supersede dps.report, so the upload is skipped as soon as sharing
 * has somewhere to write — that is the whole point of the replacement, and it
 * also stops sending every log to a third party the user no longer depends on.
 *
 * It is NOT removed outright, for two reasons. A user with neither R2 nor
 * GitHub would otherwise go from "has a link" to "has no link at all". And the
 * share worker rate-limits per account, so a bulk import can exhaust its quota
 * mid-session; `shareIdentity` falls back to the permalink when that happens,
 * but only if a permalink exists. `dpsReportEnabled: false` is the explicit
 * opt-out for users who want it gone regardless, and it wins over everything.
 */
export const shouldUploadToDpsReport = (store: any, hasR2: boolean): boolean => {
    if (store?.get?.('dpsReportEnabled') === false) return false;
    return !shareTargetConfigured(store, hasR2);
};
