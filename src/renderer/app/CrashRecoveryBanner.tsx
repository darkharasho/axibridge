/**
 * Tells the user their log list came back from a crash, rather than letting it
 * look like the list cleared itself.
 *
 * The silence was the reported bug. Main reloads the window on
 * `render-process-gone`, and before this the reloaded renderer simply rendered an
 * empty list — so a WvW night's logs vanished mid-session with no explanation,
 * twice in one evening for the user who reported it. The list is restored now,
 * but a restore the user cannot see the reason for is nearly as alarming as the
 * wipe, so the recovery says what happened and why stats are not back yet.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';

export type CrashRecoveryNotice = {
    /** Chromium's `render-process-gone` reason, e.g. 'oom' or 'crashed'. */
    reason: string;
    /** How many logs were handed back. */
    logCount: number;
};

type CrashRecoveryBannerProps = {
    notice: CrashRecoveryNotice | null;
    /** Lift the aggregation pause and recompute the restored logs. */
    onRecompute: () => void;
    /** Keep the logs, drop the notice, leave stats paused. */
    onDismiss: () => void;
};

/** Out-of-memory is worth naming: it is actionable (fewer logs at once). */
const describeReason = (reason: string): string =>
    reason === 'oom'
        ? 'AxiBridge ran out of memory and reloaded itself.'
        : `AxiBridge's display process stopped unexpectedly (${reason}) and reloaded itself.`;

export const CrashRecoveryBanner = ({ notice, onRecompute, onDismiss }: CrashRecoveryBannerProps) => {
    if (!notice) return null;

    const { reason, logCount } = notice;
    const logWord = logCount === 1 ? 'log' : 'logs';

    return (
        <div
            className="mb-3 rounded-[4px] px-3 py-2.5 flex items-start gap-3"
            style={{
                background: 'var(--status-warning-bg, rgba(251,191,36,0.08))',
                border: 'var(--panel-border-w, 1px) solid var(--status-warning-border, rgba(251,191,36,0.3))',
            }}
            data-testid="crash-recovery-banner"
        >
            <AlertTriangle
                className="w-3.5 h-3.5 mt-0.5 shrink-0"
                style={{ color: 'var(--status-warning, #fbbf24)' }}
            />
            <div className="flex-1">
                <div className="text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>
                    Recovered from a crash
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {describeReason(reason)}{' '}
                    {logCount > 0
                        ? `Your ${logCount} ${logWord} ${logCount === 1 ? 'was' : 'were'} restored.`
                        : 'No logs were in the list at the time.'}{' '}
                    {logCount > 0 && 'Stats were not recomputed automatically, because doing so can run the app out of memory again.'}
                </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {logCount > 0 && (
                    <button
                        onClick={onRecompute}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-colors"
                        style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--button-label, var(--brand-primary))' }}
                        title="Recompute stats from the restored logs"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Recompute stats
                    </button>
                )}
                <button
                    onClick={onDismiss}
                    className="px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-colors"
                    style={{ borderColor: 'var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)' }}
                    title="Dismiss this notice"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
};
