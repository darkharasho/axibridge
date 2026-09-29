import { memo } from 'react';
import { QUICK_SETTINGS, type QuickSettingsContext } from './quickSettings';

/**
 * Compact switch sized for the dashboard sidebar.
 *
 * Deliberately not SettingsView's `Toggle`: that one carries a description
 * block and upstream's native 46x26 track, roughly double the row height these
 * cards use. Same component - .axi-switch - shrunk through its own size tokens.
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
            className={`axi-switch ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            style={{ '--axi-switch-w': '32px', '--axi-switch-h': '18px', '--axi-switch-knob': '12px' } as React.CSSProperties}
        >
            <span className="axi-switch__knob" />
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
            className="rail-card axi-panel axi-panel--tile [--axi-panel-pad:8px_10px]"
        >
            <div className="rail-card__label text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Quick Settings
            </div>
            <div className="space-y-0">
                {QUICK_SETTINGS.filter((setting) => setting.isRelevant?.(context) ?? true).map((setting, index) => {
                    const ready = setting.isReady(context);
                    return (
                        <div
                            key={setting.id}
                            className="rail-row flex items-center justify-between gap-2 py-1.5"
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
