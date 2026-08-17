/**
 * Re-parse logs that arrived without Axilog data, one at a time,
 * and put the healed details back where every reader will find them.
 *
 * "Everywhere" is three places, and missing any one of them leaves the gap
 * half-closed: the main process's bulk details store (done by the IPC handler,
 * so `get-log-details` stops serving the Axilog-less copy), the renderer's
 * `DetailsCache` under BOTH the log id and the file path (the two keys the
 * hydration and streaming paths use), and the log row itself, so its
 * `parseSource` stops accusing an engine that is no longer responsible.
 *
 * Sequential by design. Each re-parse is a synchronous native call in the main
 * process, so running them concurrently would not finish sooner and would make
 * the progress count meaningless.
 */

import { useCallback, useRef, useState } from 'react';
import type { DetailsCache } from '../../cache/DetailsCache';
import type { AxilogCoverageLog } from '../utils/axilogCoverage';
import { isHealable } from '../utils/axilogCoverage';

export interface AxilogHealState {
    running: boolean;
    /** Logs re-parsed so far this run, successful or not. */
    done: number;
    total: number;
    healed: number;
    /** One line per log that could not be healed, ready to render. */
    failures: Array<{ label: string; error: string }>;
}

const IDLE: AxilogHealState = { running: false, done: 0, total: 0, healed: 0, failures: [] };

export function useAxilogHeal({
    detailsCache,
    onLogsHealed,
}: {
    detailsCache: DetailsCache | null;
    /** Marks the healed logs as axilog-sourced in the owning state. */
    onLogsHealed?: (filePaths: string[]) => void;
}) {
    const [healState, setHealState] = useState<AxilogHealState>(IDLE);
    const runningRef = useRef(false);

    const heal = useCallback(async (logs: AxilogCoverageLog[]) => {
        if (runningRef.current) return;
        const targets = logs.filter(isHealable);
        if (targets.length === 0 || !window.electronAPI?.reparseLogAxilog) return;

        runningRef.current = true;
        setHealState({ running: true, done: 0, total: targets.length, healed: 0, failures: [] });
        const healedPaths: string[] = [];
        const failures: AxilogHealState['failures'] = [];

        for (const target of targets) {
            let result: Awaited<ReturnType<NonNullable<typeof window.electronAPI.reparseLogAxilog>>> | null = null;
            try {
                result = await window.electronAPI.reparseLogAxilog({ filePath: target.filePath });
            } catch (err: any) {
                result = { success: false, error: err?.message || 'Re-parse failed.' };
            }
            if (result?.success && result.details) {
                // Both keys: streaming reads by id, hydration wrote by filePath,
                // and logsForStats entries can still carry the pre-id filePath.
                if (detailsCache) {
                    if (target.id) detailsCache.putSync(target.id, result.details);
                    if (target.filePath && target.filePath !== target.id) {
                        detailsCache.putSync(target.filePath, result.details);
                    }
                }
                healedPaths.push(target.filePath);
            } else {
                failures.push({ label: target.label, error: String(result?.error || 'Re-parse failed.') });
            }
            setHealState((prev) => ({
                ...prev,
                done: prev.done + 1,
                healed: healedPaths.length,
                failures: [...failures],
            }));
            // A re-parse is CPU-bound in the main process; yield so the window
            // stays responsive between logs.
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        if (healedPaths.length > 0) onLogsHealed?.(healedPaths);
        runningRef.current = false;
        setHealState((prev) => ({ ...prev, running: false }));
    }, [detailsCache, onLogsHealed]);

    const dismissHealResult = useCallback(() => setHealState(IDLE), []);

    return { healState, heal, dismissHealResult };
}
