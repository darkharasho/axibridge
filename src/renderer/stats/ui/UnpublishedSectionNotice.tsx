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
        className="mb-2 axi-well axi-well--sm axi-edge-meta flex items-center gap-3"
    >
        <CloudOff className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--axi-meta)' }} aria-hidden="true" />
        <div className="flex-1 min-w-0 text-[11px] leading-snug" style={{ color: 'var(--axi-text-dim)' }}>
            <span className="font-semibold" style={{ color: 'var(--axi-text)' }}>Not in published reports.</span>{' '}
            {sectionLabel} is available here, but web uploads leave it out while{' '}
            <span className="font-semibold">{settingLabel}</span> is off.
        </div>
        {onEnable && (
            <button
                type="button"
                onClick={onEnable}
                className="axi-btn axi-btn--xs flex-shrink-0"
                style={{ color: 'var(--axi-meta)', border: '1px solid var(--axi-meta)' }}
            >
                Include in uploads
            </button>
        )}
    </div>
);
