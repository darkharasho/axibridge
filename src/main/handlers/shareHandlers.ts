import { ipcMain } from 'electron';
import { shareLog, type ShareResult, type ShareTarget } from '../shareService';
import { planRetention, type RetentionAction, type RetentionEntry } from '../shareRetention';
import { SHARE_LOG_CHANNEL, SHARE_PLAN_RETENTION_CHANNEL } from '../../shared/shareChannels';

export interface ShareHandlerOptions {
    store: any;
    /** Parsed details for a log, or null if it has not been parsed. */
    getDetails: (logId: string) => any;
    /** Where Tier 1 bytes go — the user's R2 or their fights repo, null if neither. */
    resolveTarget: (store: any) => ShareTarget | null | Promise<ShareTarget | null>;
}

const errorMessage = (err: unknown, fallback: string): string =>
    (err instanceof Error && err.message) || fallback;

export function registerShareHandlers(opts: ShareHandlerOptions) {
    const { store, getDetails, resolveTarget } = opts;

    ipcMain.handle(SHARE_LOG_CHANNEL, async (_event, payload: { logId: string }): Promise<ShareResult> => {
        const logId = payload?.logId;
        if (!logId) return { success: false, error: 'No log specified.' };

        let details: any;
        try {
            // `await` is a no-op on a non-promise value, so this stays safe even
            // when the real dependency is synchronous — but it is required to
            // catch a REJECTING promise, which a bare call would let sail past
            // this try/catch as an unhandled rejection.
            details = await getDetails(logId);
        } catch (err) {
            return { success: false, error: errorMessage(err, 'Failed to load that log’s details.') };
        }
        if (!details) {
            return { success: false, error: 'That log has no details yet — parse it before sharing.' };
        }

        let target: ShareTarget | null;
        try {
            target = await resolveTarget(store);
        } catch (err) {
            return { success: false, error: errorMessage(err, 'Failed to resolve where to store the report.') };
        }
        if (!target) {
            return {
                success: false,
                // `resolveTarget` is the two-rung ladder (`resolveShareTarget`):
                // R2 if connected, else the managed fights repo on GitHub Pages.
                // It only returns null when NEITHER is available, so the copy
                // names the easier rung first — connecting GitHub is what most
                // users have already done to publish web reports.
                error: 'Sharing needs somewhere to put the report. Connect GitHub in Settings and '
                    + 'AxiBridge will create a repository for your fights automatically, or connect '
                    + 'Cloudflare R2 if you would rather host them there.'
            };
        }

        let githubToken: string | null;
        try {
            githubToken = ((await store?.get?.('githubToken')) as string | undefined) ?? null;
        } catch (err) {
            return { success: false, error: errorMessage(err, 'Failed to read your GitHub connection.') };
        }

        // shareLog itself is proven never to reject — every failure mode inside
        // it resolves to `{ success: false, error }` — so it is deliberately not
        // wrapped in another try/catch here.
        return shareLog(details, logId, { target, githubToken });
    });

    ipcMain.handle(SHARE_PLAN_RETENTION_CHANNEL, async (_event, payload: {
        entries?: RetentionEntry[];
        budgetBytes?: number;
        highWaterPct?: number;
    }): Promise<{ success: boolean; actions: RetentionAction[] }> => {
        const entries = Array.isArray(payload?.entries) ? payload.entries : [];
        const actions = planRetention(entries, {
            budgetBytes: payload?.budgetBytes,
            highWaterPct: payload?.highWaterPct
        });
        return { success: true, actions };
    });
}
