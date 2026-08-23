import { memo } from 'react';
import { QUICK_SETTINGS, type QuickSettingsContext } from './quickSettings';

/**
 * Compact switch sized for the dashboard sidebar.
 *
 * Deliberately not SettingsView's `Toggle`: that one carries a description
 * block and a 44x24 track, which is roughly double the row height these cards
 * use. Same visual language (rounded-[4px] track, sliding knob), tighter box.
 */
const QuickToggle = memo(function QuickToggle({ enabled, disabled, label, onChange }: {
    enabled: boolean;
    disabled: boolean;
    label: string;
    onChange: (value: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!enabled)}
            className={`relative w-8 h-[18px] shrink-0 rounded-[4px] border transition-colors toggle-track ${
                enabled ? 'bg-blue-500/30 border-blue-500/40 toggle-track--on' : 'border-white/10 toggle-track--off'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            style={!enabled ? { background: 'var(--bg-input)' } : undefined}
        >
            <span
                className={`absolute top-[2px] left-0 w-3 h-3 rounded-[3px] bg-white shadow-md transition-transform toggle-knob ${
                    enabled ? 'translate-x-[16px]' : 'translate-x-[2px]'
                }`}
            />
        </button>
    );
});

/**
 * Dashboard card holding the handful of settings worth flipping between runs.
 *
 * Knows nothing about individual settings — it renders whatever
 * {@link QUICK_SETTINGS} holds, and each descriptor routes its own read/write.
 */
export function QuickSettingsCard({ context }: { context: QuickSettingsContext }) {
    return (
        <div
            className="rounded-[4px] border p-3"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}
        >
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Quick Settings
            </div>
            <div className="space-y-0">
                {QUICK_SETTINGS.filter((setting) => setting.isRelevant?.(context) ?? true).map((setting, index) => {
                    const ready = setting.isReady(context);
                    return (
                        <div
                            key={setting.id}
                            className="flex items-center justify-between gap-2 py-1.5"
                            style={index === 0 ? undefined : { borderTop: '1px solid var(--border-subtle)' }}
                        >
                            <span className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }} title={setting.hint}>
                                {setting.label}
                            </span>
                            <QuickToggle
                                enabled={setting.read(context)}
                                disabled={!ready}
                                label={setting.label}
                                onChange={(value) => setting.write(context, value)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
