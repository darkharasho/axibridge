import { useEffect, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { PublishWebhookOption } from '../hooks/useStatsUploads';

interface PublishWebhookPopoverProps {
    webhooks: PublishWebhookOption[];
    initialSelection: string[];
    onConfirm: (ids: string[]) => void;
    onCancel: () => void;
}

/** Per-publish webhook picker shown when clicking "Upload to Web" while report
 *  webhooks exist. Seeds its checkboxes from the remembered selection; confirming
 *  with none checked publishes the report without posting to Discord. */
export const PublishWebhookPopover = ({ webhooks, initialSelection, onConfirm, onCancel }: PublishWebhookPopoverProps) => {
    const [checked, setChecked] = useState<Set<string>>(() => new Set(initialSelection));
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!ref.current || !target || ref.current.contains(target)) return;
            onCancel();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel();
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onCancel]);

    const allChecked = webhooks.length > 0 && webhooks.every((hook) => checked.has(hook.id));
    const count = webhooks.filter((hook) => checked.has(hook.id)).length;

    const toggle = (id: string) => setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const toggleAll = () => setChecked(allChecked ? new Set() : new Set(webhooks.map((hook) => hook.id)));

    return (
        <div
            ref={ref}
            role="dialog"
            aria-label="Choose webhooks to publish to"
            /* Pad 0: every row inside writes its own px-4, and the footer wants to
               run edge to edge. */
            className="app-dropdown axi-panel axi-panel--tile axi-panel--float absolute right-0 top-full mt-2 z-50 w-[320px] overflow-hidden [--axi-panel-pad:0]"
        >
            <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
                <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--axi-text)' }}>Publish report</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--axi-text-dim)' }}>Post the report link to&hellip;</div>
                </div>
                <button type="button" onClick={toggleAll} className="axi-action text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--axi-accent)' }}>
                    {allChecked ? 'Clear all' : 'Select all'}
                </button>
            </div>
            <div className="px-2 pb-1.5 max-h-64 overflow-auto">
                {webhooks.map((hook, index) => {
                    const on = checked.has(hook.id);
                    return (
                        <label
                            key={hook.id}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--axi-radius-sm)] px-2 py-2 text-left"
                        >
                            {/* A real checkbox, so the language draws it: a span wearing a
                                class is not a checkbox, and the rule that redraws checkboxes
                                could not see the one that used to be here. */}
                            <input
                                type="checkbox"
                                className="axi-check"
                                checked={on}
                                onChange={() => toggle(hook.id)}
                            />
                            <span className="min-w-0 flex-1 text-[13px] font-semibold truncate" style={{ color: 'var(--axi-text)' }}>
                                {hook.name || `Webhook ${index + 1}`}
                                {hook.isForum && (
                                    <span className="ml-1.5 align-middle axi-chip">forum</span>
                                )}
                            </span>
                        </label>
                    );
                })}
            </div>
            <div className="text-[11px] px-4 pb-3 pt-0.5 leading-snug" style={{ color: 'var(--axi-text-dim)' }}>
                Leave all unchecked to publish the report without posting to Discord.
            </div>
            <div className="flex justify-end gap-2 px-3.5 py-2.5" style={{ borderTop: 'var(--axi-border-control) solid var(--axi-ink-line)', background: 'var(--axi-ground)' }}>
                <button type="button" onClick={onCancel} className="axi-btn axi-btn--ghost">
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onConfirm(webhooks.filter((hook) => checked.has(hook.id)).map((hook) => hook.id))}
                    className="axi-btn"
                    style={{ background: 'var(--axi-accent)', color: 'var(--axi-accent-ink)', border: 'none' }}
                >
                    <UploadCloud className="w-3.5 h-3.5" strokeWidth={2.2} />
                    {count > 0 ? `Publish · post to ${count}` : 'Publish'}
                </button>
            </div>
        </div>
    );
};
