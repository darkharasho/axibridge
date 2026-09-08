import { coerceReportPostStyle, IReportWebhook, MAX_FORUM_POST_TAGS, parseForumTagIds, renderReportTitle, type ReportPostStyle } from '../shared/reportWebhooks';
import { buildReportCardModel } from '../shared/reportCardModel';
import { DISCORD_WEBHOOK_AVATAR_URL } from './discord';
import { buildReportEmbed, REPORT_CARD_FILENAME } from './reportEmbed';

export interface ReportWebhookPostResult {
    id: string;
    name: string;
    ok: boolean;
    error?: string;
}

const POST_TIMEOUT_MS = 10_000;
const IMAGE_POST_TIMEOUT_MS = 30_000;
/** Conservative ceiling under Discord's attachment limit. An oversized card
 *  degrades to text before we send, rather than after a doomed upload. */
const MAX_CARD_BYTES = 7 * 1024 * 1024;

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
    /** Rendered card keyed by style. A missing or null entry means the hook's
     *  style degrades to text for that post. */
    images?: Partial<Record<ReportPostStyle, Buffer | null>>;
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
    const model = buildReportCardModel(opts.meta, opts.stats);

    for (const hook of opts.webhooks) {
        let title = '';
        let embed: any;
        const tagIds = parseForumTagIds(hook.forumTagIds).slice(0, MAX_FORUM_POST_TAGS);

        const style = coerceReportPostStyle(hook.style);
        const candidate = style === 'text' ? null : (opts.images?.[style] ?? null);
        const image = candidate && candidate.byteLength > 0 && candidate.byteLength <= MAX_CARD_BYTES
            ? candidate
            : null;

        const post = async (withThreadName: boolean, withTags: boolean) => {
            const payload: any = {
                username: 'AxiBridge',
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                embeds: [embed],
            };
            if (withThreadName) {
                payload.thread_name = title.slice(0, 100);
                if (withTags && tagIds.length > 0) payload.applied_tags = tagIds;
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), image ? IMAGE_POST_TIMEOUT_MS : POST_TIMEOUT_MS);
            try {
                // A fresh body per attempt: the self-heal retries call post()
                // again, and a FormData whose stream has already been consumed
                // would fail in a way that looks like a Discord error.
                const init: RequestInit = image
                    ? {
                        method: 'POST',
                        // No Content-Type — fetch must write the multipart boundary itself.
                        body: (() => {
                            const form = new FormData();
                            form.set('payload_json', JSON.stringify(payload));
                            form.set(
                                'files[0]',
                                new Blob([new Uint8Array(image)], { type: 'image/png' }),
                                REPORT_CARD_FILENAME
                            );
                            return form;
                        })(),
                        signal: controller.signal,
                    }
                    : {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: controller.signal,
                    };
                const resp = await doFetch(hook.url, init);
                const text = resp.ok ? '' : await resp.text().catch(() => '');
                return { ok: resp.ok, status: resp.status, text };
            } finally {
                clearTimeout(timer);
            }
        };

        const label = hook.name || 'webhook';
        try {
            title = renderReportTitle(hook.titleTemplate, ctx);
            embed = buildReportEmbed({
                model,
                style,
                title,
                url: opts.url,
                hasImage: image !== null,
            });

            let usedForum = hook.isForum;
            let droppedTags = false;
            let attempt = await post(usedForum, true);
            // Forum self-heal: a 400 mentioning thread_name means the forum flag
            // is wrong in whichever direction we sent. Retry once flipped and
            // persist the corrected flag on success.
            if (!attempt.ok && attempt.status === 400 && /thread[_ ]?name/i.test(attempt.text)) {
                usedForum = !usedForum;
                attempt = await post(usedForum, true);
            }
            // Tag self-heal: a 400 mentioning applied_tags means a bad or deleted
            // tag id. Drop tags so the report link still lands; the ids stay in
            // settings for the user to fix.
            if (!attempt.ok && attempt.status === 400 && /applied_tags/i.test(attempt.text)) {
                droppedTags = true;
                attempt = await post(usedForum, false);
            }
            if (attempt.ok) {
                if (usedForum !== hook.isForum) opts.persistForumFlag?.(hook.id, usedForum);
                results.push({ id: hook.id, name: hook.name, ok: true });
                if (droppedTags) {
                    opts.onStatus?.(`Posted to ${label} without tags — check its forum tag IDs.`, true);
                } else {
                    opts.onStatus?.(`Posted report to ${label}.`);
                }
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
