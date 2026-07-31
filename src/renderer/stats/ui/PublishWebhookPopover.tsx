import { useEffect, useRef, useState } from 'react';
import { Check, UploadCloud } from 'lucide-react';
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
            className="app-dropdown absolute right-0 top-full mt-2 z-50 w-[320px] rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', boxShadow: 'var(--shadow-dropdown)' }}
        >
            <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
                <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Publish report</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Post the report link to&hellip;</div>
                </div>
                <button type="button" onClick={toggleAll} className="text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--brand-primary)' }}>
                    {allChecked ? 'Clear all' : 'Select all'}
                </button>
            </div>
            <div className="px-2 pb-1.5 max-h-64 overflow-auto">
                {webhooks.map((hook, index) => {
                    const on = checked.has(hook.id);
                    return (
                        <button
                            key={hook.id}
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={on}
                            onClick={() => toggle(hook.id)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors"
                            onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                        >
                            <span
                                className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px]"
                                style={{ background: on ? 'var(--brand-primary)' : 'var(--bg-input)', border: `1.5px solid ${on ? 'var(--brand-primary)' : 'var(--border-hover)'}` }}
                            >
                                {on && <Check className="w-3 h-3" style={{ color: '#0b1220' }} strokeWidth={3.2} />}
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {hook.name || `Webhook ${index + 1}`}
                                {hook.isForum && (
                                    <span className="ml-1.5 align-middle text-[9px] uppercase tracking-wide rounded px-1 py-0.5" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>forum</span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="text-[11px] px-4 pb-3 pt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                Leave all unchecked to publish the report without posting to Discord.
            </div>
            <div className="flex justify-end gap-2 px-3.5 py-2.5" style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-card-inner)' }}>
                <button type="button" onClick={onCancel} className="px-3.5 py-2 text-[13px] font-semibold rounded-lg" style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onConfirm(webhooks.filter((hook) => checked.has(hook.id)).map((hook) => hook.id))}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-bold rounded-lg"
                    style={{ background: 'var(--brand-primary)', color: '#0b1220', border: 'none' }}
                >
                    <UploadCloud className="w-3.5 h-3.5" strokeWidth={2.2} />
                    {count > 0 ? `Publish · post to ${count}` : 'Publish'}
                </button>
            </div>
        </div>
    );
};
