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
            <p className="rail-card__label axi-eyebrow">Quick Settings</p>
            <dl className="axi-readout">
                {QUICK_SETTINGS.filter((setting) => setting.isRelevant?.(context) ?? true).map((setting) => {
                    const ready = setting.isReady(context);
                    return (
                        <div key={setting.id} className="rail-row axi-readout__row">
                            <dt className="axi-readout__k" title={setting.hint}>
                                {setting.label}
                            </dt>
                            <dd className="axi-readout__v">
                                <QuickToggle
                                    enabled={setting.read(context)}
                                    disabled={!ready}
                                    label={setting.label}
                                    onChange={(value) => setting.write(context, value)}
                                />
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
