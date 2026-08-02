import { IReportWebhook, renderReportTitle } from '../shared/reportWebhooks';
import { DISCORD_WEBHOOK_AVATAR_URL } from './discord';

export interface ReportWebhookPostResult {
    id: string;
    name: string;
    ok: boolean;
    error?: string;
}

const EMBED_COLOR = 0xef4444;
const POST_TIMEOUT_MS = 10_000;

export const buildReportSummaryLine = (stats: any): string => {
    const parts: string[] = [];
    const total = Number(stats?.total);
    if (Number.isFinite(total) && total > 0) {
        parts.push(`${total} fight${total === 1 ? '' : 's'}`);
    }
    const wins = Number(stats?.wins);
    const losses = Number(stats?.losses);
    if (Number.isFinite(wins) && Number.isFinite(losses)) {
        parts.push(`${wins}W – ${losses}L`);
    }
    const kdr = stats?.squadKDR;
    if (kdr !== undefined && kdr !== null && String(kdr).length > 0) {
        parts.push(`Squad KDR ${kdr}`);
    }
    return parts.join(' • ');
};

export async function postReportToWebhooks(opts: {
    webhooks: IReportWebhook[];
    meta: any;
    stats: any;
    url: string;
    onStatus?: (line: string, isWarn?: boolean) => void;
    persistForumFlag?: (id: string, isForum: boolean) => void;
    fetchImpl?: typeof fetch;
}): Promise<ReportWebhookPostResult[]> {
    const doFetch = opts.fetchImpl || fetch;
    const results: ReportWebhookPostResult[] = [];

    const parsedStart = new Date(opts.meta?.dateStart || Date.now());
    const ctx = {
        sessionStart: Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart,
        primaryCommander: String(opts.meta?.primaryCommander || ''),
        primaryCommanderAccount: String(opts.meta?.primaryCommanderAccount || ''),
        commanders: Array.isArray(opts.meta?.commanders) ? opts.meta.commanders.map(String) : [],
        guildName: String(opts.meta?.guild?.name || ''),
        guildTag: String(opts.meta?.guild?.tag || ''),
    };
    const description = buildReportSummaryLine(opts.stats);

    for (const hook of opts.webhooks) {
        let title = '';
        let embed: any;

        const post = async (withThreadName: boolean) => {
            const body: any = {
                username: 'AxiBridge',
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                embeds: [embed],
            };
            if (withThreadName) body.thread_name = title.slice(0, 100);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
            try {
                const resp = await doFetch(hook.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                const text = resp.ok ? '' : await resp.text().catch(() => '');
                return { ok: resp.ok, status: resp.status, text };
            } finally {
                clearTimeout(timer);
            }
        };

        const label = hook.name || 'webhook';
        try {
            title = renderReportTitle(hook.titleTemplate, ctx);
            embed = {
                title,
                url: opts.url,
                color: EMBED_COLOR,
            };
            if (description) embed.description = description;
            if (opts.meta?.dateLabel) embed.footer = { text: String(opts.meta.dateLabel) };

            let attempt = await post(hook.isForum);
            // Forum self-heal: a 400 mentioning thread_name means the forum flag
            // is wrong in whichever direction we sent. Retry once flipped and
            // persist the corrected flag on success.
            if (!attempt.ok && attempt.status === 400 && /thread[_ ]?name/i.test(attempt.text)) {
                const flipped = !hook.isForum;
                attempt = await post(flipped);
                if (attempt.ok) opts.persistForumFlag?.(hook.id, flipped);
            }
            if (attempt.ok) {
                results.push({ id: hook.id, name: hook.name, ok: true });
                opts.onStatus?.(`Posted report to ${label}.`);
            } else {
                const error = `HTTP ${attempt.status}${attempt.text ? `: ${attempt.text.slice(0, 120)}` : ''}`;
                results.push({ id: hook.id, name: hook.name, ok: false, error });
                opts.onStatus?.(`Failed to post to ${label} — ${error}`, true);
            }
        } catch (err: any) {
            const error = String(err?.message || err);
            results.push({ id: hook.id, name: hook.name, ok: false, error });
            opts.onStatus?.(`Failed to post to ${label} — ${error}`, true);
        }
    }
    return results;
}
