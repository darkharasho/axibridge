import React from 'react';
import { X } from 'lucide-react';
import type { DecodedCast } from '../computeRotationTimeline';

/** `m:ss.mmm`, with a leading `-` for a cast that began before the log did.
 *  Duplicated from `RotationTrack` deliberately: hoisting it into a shared
 *  module for two callers in the same folder buys nothing, and the two
 *  formats are free to diverge if the sheet ever wants more precision. */
const mmssMillis = (ms: number): string => {
    const sign = ms < 0 ? '-' : '';
    const abs = Math.abs(ms);
    const totalSeconds = Math.floor(abs / 1000);
    return `${sign}${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}.${String(Math.round(abs % 1000)).padStart(3, '0')}`;
};

export interface RotationCastSheetProps {
    casts: DecodedCast[];
    /** Index into `casts`. The caller guarantees it is in range. */
    index: number;
    fightDurationMs: number;
    onClose: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode; testId?: string; color?: string }> = ({
    label, children, testId, color,
}) => (
    <div className="flex flex-col gap-0.5 min-w-[110px] py-1">
        <span className="text-[10px] uppercase tracking-[0.05em]" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <b className="text-[13px] font-semibold" data-testid={testId} style={{ color: color || 'var(--text-primary)' }}>
            {children}
        </b>
    </div>
);

/**
 * Detail for exactly one cast. Rendered under the track rather than over it so
 * the surrounding rows stay visible — a cast only means something next to the
 * casts around it.
 */
export const RotationCastSheet: React.FC<RotationCastSheetProps> = ({
    casts, index, fightDurationMs, onClose,
}) => {
    const cast = casts[index];
    if (!cast) return null;
    const prev = index > 0 ? casts[index - 1] : null;
    // May be negative: real logs contain casts that begin before the previous
    // one has finished. That is information, so it is shown rather than clamped.
    const gapMs = prev ? cast.castTime - (prev.castTime + prev.duration) : null;
    const sameSkill = casts
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.skillId === cast.skillId);
    // Same guard as the track: a bare number is an unexpanded `iconIndex`
    // reference the report trimmed out from under us, never an image URL.
    const iconSrc = typeof cast.icon === 'string' && cast.icon.length > 0 ? cast.icon : null;
    const span = Math.max(1, fightDurationMs);

    return (
        <div
            data-testid="rotation-cast-sheet"
            className="mt-3 rounded-[var(--radius-md)] p-3"
            style={{
                background: 'var(--bg-card-inner)',
                border: '1px solid var(--border-default)',
                borderTop: '2px solid var(--brand-primary)',
            }}
        >
            <div className="flex items-center gap-2.5">
                {iconSrc && <img src={iconSrc} alt="" className="h-8 w-8 object-contain shrink-0" />}
                <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{cast.name}</h4>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {sameSkill.length} {sameSkill.length === 1 ? 'cast' : 'casts'} this fight
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close cast detail"
                    className="flex items-center justify-center w-[26px] h-[26px] shrink-0"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                >
                    <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
                </button>
            </div>
            <div className="flex flex-wrap gap-x-6 mt-2.5">
                <Field label="Cast at">{mmssMillis(cast.castTime)}</Field>
                <Field label="Duration">{cast.duration} ms</Field>
                <Field label="Outcome" color={cast.interrupted ? 'var(--status-error)' : undefined}>
                    {cast.interrupted ? 'Interrupted' : 'Completed'}
                </Field>
                <Field label="Gap since prev" testId="rotation-cast-gap">
                    {gapMs === null ? '—' : `${gapMs} ms`}
                </Field>
                <Field label="Previous cast">{prev ? prev.name : '—'}</Field>
            </div>
            <div className="text-[10px] uppercase tracking-[0.05em] mt-2.5" style={{ color: 'var(--text-muted)' }}>
                Every cast of this skill
            </div>
            <div className="relative h-5 mt-1 rounded-[var(--radius-md)]" style={{ background: 'var(--bg-input)' }}>
                {sameSkill.map(({ c, i }) => (
                    <span
                        key={i}
                        data-spark-tick=""
                        className="absolute top-1 bottom-1 rounded-sm"
                        style={{
                            left: `${(Math.max(0, c.castTime) / span) * 100}%`,
                            width: i === index ? '4px' : '3px',
                            background: i === index ? 'var(--text-primary)' : 'var(--brand-primary)',
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
