import { useMemo } from 'react';
import { shareIdentity } from '../../../shared/shareIdentity';

export interface StatsDataProgress {
    active: boolean;
    total: number;
    processed: number;
    pending: number;
    unavailable: number;
}

export function useStatsDataProgress(
    logs: ILogData[],
    view: string,
    isBulkUploadActive: boolean
): StatsDataProgress {
    return useMemo(() => {
        const total = logs.length;
        if (view !== 'stats') {
            return {
                active: false,
                total,
                processed: total,
                pending: 0,
                unavailable: 0
            };
        }
        if (total <= 0) {
            return {
                active: false,
                total: 0,
                processed: 0,
                pending: 0,
                unavailable: 0
            };
        }
        let pending = 0;
        let unavailable = 0;
        logs.forEach((log) => {
            const ds = log.detailsStatus || 'idle';
            if (ds === 'available' || ds === 'loaded') {
                return;
            }
            if (ds === 'unavailable') {
                unavailable += 1;
                return;
            }
            if (ds === 'exhausted') {
                unavailable += 1;
                return;
            }
            const status = log.status || 'queued';
            // Same link test as `useDetailsHydration` -- these two must agree on
            // which logs are hydration candidates, or the progress bar counts a
            // population the hydration pass will never visit.
            const canHydrateFromPermalink = (status === 'success' || status === 'calculating' || status === 'discord') && Boolean(shareIdentity(log));
            if (canHydrateFromPermalink) {
                pending += 1;
                return;
            }
            const inFlightStatus = status === 'queued'
                || status === 'pending'
                || status === 'uploading'
                || status === 'retrying'
                || status === 'discord'
                || status === 'calculating';
            if (inFlightStatus) {
                if (isBulkUploadActive) {
                    pending += 1;
                } else {
                    unavailable += 1;
                }
                return;
            }
            unavailable += 1;
        });
        const processed = Math.max(0, total - pending);
        return {
            active: pending > 0,
            total,
            processed,
            pending,
            unavailable
        };
    }, [logs, view, isBulkUploadActive]);
}
