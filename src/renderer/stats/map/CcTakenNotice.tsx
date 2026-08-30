import React from 'react';
import { useStatsStore } from '../statsStore';
import type { CcTakenEvent } from './replayTypes';

interface CcTakenNoticeProps {
    /**
     * Widened past `ReplayFightPayload`'s `CcTakenEvent[] | null` on purpose.
     * The type is only true of a payload this build produced; a fight
     * deserialized from an older `report.json` — or one cached by a build
     * from before the lane existed — simply has no such key, and arrives as
     * `undefined` however the type reads. Both spellings mean the same thing
     * to a viewer, so both are handled here rather than trusted away.
     */
    ccTakenEvents: CcTakenEvent[] | null | undefined;
}

/**
 * Says out loud when the CC-taken marks layer is on but this fight has no
 * lane to draw from.
 *
 * Without it the layer fails silently and identically to a quiet fight: the
 * toggle is on, the map is bare, and there is nothing to tell "nobody was
 * CC'd" apart from "this log was parsed before axilog 1.9.0, or with
 * timeline arrays off". `null` vs `[]` already carries that distinction all
 * the way from the fold — this is the only place it reaches the user.
 */
export const CcTakenNotice: React.FC<CcTakenNoticeProps> = ({ ccTakenEvents }) => {
    const on = useStatsStore(state => state.replayLayers.ccTakenMarks);
    // `!=`, not `!==`: catches `undefined` alongside `null` (see the prop).
    if (!on || ccTakenEvents != null) return null;
    return (
        <div
            title="Per-player incoming CC comes from the native per-entity cc_taken lane, which needs Include Timeline Arrays enabled and axilog 1.9.0 or newer. Re-parse this log to fill it in."
            style={{
                position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, pointerEvents: 'auto',
                fontSize: 11, padding: '3px 8px', borderRadius: 4,
                border: '1px solid var(--status-warning)', color: 'var(--status-warning)',
                background: 'var(--bg-elevated)', whiteSpace: 'nowrap',
            }}
        >
            CC taken: not recorded for this fight
        </div>
    );
};

export default CcTakenNotice;
