import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
    IReportWebhook,
    makeDefaultReportWebhook,
    renderReportTitle,
} from '../shared/reportWebhooks';

const PREVIEW_CTX = {
    sessionStart: new Date(),
    primaryCommander: 'Axi Vale',
    commanders: ['Axi Vale'],
    primaryCommanderAccount: 'Axi.1234',
    guildName: 'Axius Imperium',
    guildTag: 'AXI',
};

const looksLikeDiscordWebhook = (url: string) =>
    !url || /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\//.test(url);

export function ReportWebhooksCard({
    reportWebhooks,
    onChange,
}: {
    reportWebhooks: IReportWebhook[];
    onChange: (next: IReportWebhook[]) => void;
}) {
    // Local drafts so text fields commit on blur instead of per keystroke.
    const [drafts, setDrafts] = useState<Record<string, Partial<IReportWebhook>>>({});

    const draftValue = (hook: IReportWebhook, key: 'name' | 'url' | 'titleTemplate') =>
        (drafts[hook.id]?.[key] as string | undefined) ?? hook[key];

    const setDraft = (id: string, key: 'name' | 'url' | 'titleTemplate', value: string) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
    };

    const commitDraft = (hook: IReportWebhook) => {
        const draft = drafts[hook.id];
        if (!draft) return;
        const next = reportWebhooks.map((entry) =>
            entry.id === hook.id ? { ...entry, ...draft } : entry
        );
        setDrafts((prev) => {
            const { [hook.id]: _dropped, ...rest } = prev;
            return rest;
        });
        onChange(next);
    };

    const patch = (id: string, changes: Partial<IReportWebhook>) => {
        onChange(reportWebhooks.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
    };

    return (
        <div className="rounded-[4px] border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-center justify-between mb-1">
                <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Report Webhooks</div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Every enabled webhook gets the report link after each Upload to Web.
                        Forum channels create a new post titled from the template.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onChange([...reportWebhooks, makeDefaultReportWebhook(Date.now().toString())])}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-semibold border transition-colors"
                    style={{ background: 'var(--accent-bg)', color: 'var(--text-primary)', borderColor: 'var(--accent-border)' }}
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add Webhook
                </button>
            </div>
            <div className="space-y-3 mt-3">
                {reportWebhooks.map((hook) => {
                    const url = draftValue(hook, 'url');
                    const template = draftValue(hook, 'titleTemplate');
                    return (
                        <div key={hook.id} className="rounded-[4px] border p-3 space-y-2" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Name"
                                    value={draftValue(hook, 'name')}
                                    onChange={(e) => setDraft(hook.id, 'name', e.target.value)}
                                    onBlur={() => commitDraft(hook)}
                                    className="flex-1 min-w-0 rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none"
                                    style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                                />
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        aria-label="Enabled"
                                        checked={hook.enabled}
                                        onChange={(e) => patch(hook.id, { enabled: e.target.checked })}
                                    />
                                    Enabled
                                </label>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        aria-label="Forum channel"
                                        checked={hook.isForum}
                                        onChange={(e) => patch(hook.id, { isForum: e.target.checked })}
                                    />
                                    Forum channel
                                </label>
                                <button
                                    type="button"
                                    title="Remove webhook"
                                    onClick={() => onChange(reportWebhooks.filter((entry) => entry.id !== hook.id))}
                                    className="p-1.5 rounded-[4px] transition-colors"
                                    style={{ color: 'var(--status-error, #f87171)' }}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="https://discord.com/api/webhooks/..."
                                value={url}
                                onChange={(e) => setDraft(hook.id, 'url', e.target.value)}
                                onBlur={() => commitDraft(hook)}
                                className="w-full rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none"
                                style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            />
                            {!looksLikeDiscordWebhook(url) && (
                                <p className="text-[11px]" style={{ color: 'var(--status-warning, #fbbf24)' }}>
                                    This doesn't look like a Discord webhook URL.
                                </p>
                            )}
                            <input
                                type="text"
                                placeholder="{date} - {day_of_week} - {commander}"
                                value={template}
                                onChange={(e) => setDraft(hook.id, 'titleTemplate', e.target.value)}
                                onBlur={() => commitDraft(hook)}
                                className="w-full rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none font-mono"
                                style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            />
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                Preview: {renderReportTitle(template, PREVIEW_CTX)}
                                <span className="ml-2 opacity-70">
                                    Placeholders: {'{date}'} {'{day_of_week}'} {'{commander}'} {'{commanders}'} {'{account}'} {'{guild}'} {'{guild_tag}'}
                                </span>
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
