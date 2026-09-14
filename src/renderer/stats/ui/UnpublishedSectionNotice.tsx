/**
 * Says that the section on screen will not appear in a published web report.
 *
 * Replay is kept locally by default but only published when the user opts in,
 * so without this the desktop shows a feature the report they are about to
 * upload silently lacks. Desktop-only: a published report never renders it.
 */

import { CloudOff } from 'lucide-react';

type UnpublishedSectionNoticeProps = {
    /** What is left out, e.g. "Map Replay". */
    sectionLabel: string;
    /** The setting that would include it, named as it appears in Settings. */
    settingLabel: string;
    /** Turns that setting on. Omitted when the host cannot write it. */
    onEnable?: () => void;
};

export const UnpublishedSectionNotice = ({ sectionLabel, settingLabel, onEnable }: UnpublishedSectionNoticeProps) => (
    <div
        data-testid="unpublished-section-notice"
        className="mb-2 rounded-[4px] px-3 py-2 flex items-center gap-3"
        style={{ background: 'var(--status-info-bg)', border: '1px solid var(--status-info-border)' }}
    >
        <CloudOff className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--status-info)' }} aria-hidden="true" />
        <div className="flex-1 min-w-0 text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Not in published reports.</span>{' '}
            {sectionLabel} is available here, but web uploads leave it out while{' '}
            <span className="font-semibold">{settingLabel}</span> is off.
        </div>
        {onEnable && (
            <button
                type="button"
                onClick={onEnable}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-[4px] flex-shrink-0 hover:brightness-125"
                style={{ color: 'var(--status-info)', border: '1px solid var(--status-info-border)' }}
            >
                Include in uploads
            </button>
        )}
    </div>
);
