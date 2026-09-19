import type { PointerRecord } from './pointer';

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const formatDuration = (ms: number): string => {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const describe = (record: PointerRecord): string => {
    const { sq, en, m, d } = record.sum;
    const head = `${sq} squad vs ${en} enemies · ${m} · ${formatDuration(d)}`;
    if (record.stage === 'tombstone') return `${head} — full report no longer stored`;
    if (record.stage === 'demoted') return `${head} — full stats, without map replay`;
    return head;
};

/**
 * Discord's crawler does not run JavaScript, so the preview has to be in the
 * served HTML. The heavy report is fetched client-side from the user's own
 * storage, which never touches this Worker.
 */
export const renderPointerHtml = (
    record: PointerRecord,
    opts: { code: string; viewerUrl: string }
): string => {
    const title = escapeHtml(record.sum.f);
    const description = escapeHtml(describe(record));
    const canonical = escapeHtml(`https://bridge.axi.link/r/${opts.code}`);
    const boot = record.stage === 'tombstone'
        ? 'null'
        : JSON.stringify({ loc: record.loc, stage: record.stage });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title} — AxiBridge</title>
<meta property="og:title" content="${title} — AxiBridge">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${canonical}">
</head>
<body>
<script id="axibridge-share" type="application/json">${boot}</script>
<script type="module" src="${escapeHtml(opts.viewerUrl)}/viewer.js"></script>
</body>
</html>`;
};
