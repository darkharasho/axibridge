import type { CardBoard, ReportCardModel } from '../shared/reportCardModel';
import type { ReportPostStyle } from '../shared/reportWebhooks';
import { PROFESSION_COLORS, getProfessionAbbrev } from '../shared/professionUtils';

/** Allow-list of profession names that have a real file in
 *  `public/img/class-icons/`. `PROFESSION_COLORS` is keyed by every known
 *  profession/elite-spec name (plus a synthetic `Unknown` entry we exclude);
 *  it is the same set the rest of the app already trusts for profession
 *  identity. A `profession` string from a leaderboard entry is user/log
 *  controlled — it must never be turned into a filesystem path unless it is a
 *  member of this set, or a crafted value such as `../../../../Users/x/secret`
 *  would be read off disk and inlined into the capture window. This module is
 *  pure (no `fs`, no Electron), so the gate is applied both here — nothing
 *  outside the set is ever rendered — and again in `resolveReportCardAssets`,
 *  which is the only place that touches the filesystem. */
export const KNOWN_PROFESSIONS = new Set(
    Object.keys(PROFESSION_COLORS).filter((key) => key !== 'Unknown')
);

export type ReportCardVariant = Exclude<ReportPostStyle, 'text'>;

/** Every asset arrives pre-encoded as a `data:` URI.
 *
 *  The card document is loaded via `loadURL('data:text/html,...')`, which gives
 *  it an opaque origin — Chromium then refuses *every* `file://` subresource
 *  ("Not allowed to load local resource"), silently dropping the bundled font
 *  and all icons on every platform. Inlining is the deterministic fix; the
 *  alternatives (`webSecurity: false`, or switching to `loadFile`) either widen
 *  the capture window's privileges or add a temp-file lifecycle.
 *
 *  A `null`/absent entry means the file was missing or unreadable, and the
 *  corresponding element degrades (font → system sans, icon → text
 *  abbreviation, glyph → hidden) instead of throwing. */
export interface ReportCardAssets {
    /** `data:font/woff2;base64,...`, or null when the woff2 is unreadable. */
    fontDataUri: string | null;
    /** Profession name → `data:image/png;base64,...`. Only ever populated with
     *  keys from `KNOWN_PROFESSIONS`. */
    iconDataUris: Record<string, string>;
    /** `data:image/png;base64,...` for the footer glyph, or null. */
    glyphDataUri: string | null;
}

/** Authored at ~2x Discord's embed image width so the capture downsamples
 *  crisply. `height` is a starting box; the renderer measures the real content
 *  height before capturing. */
export const REPORT_CARD_SIZES: Record<ReportCardVariant, { width: number; height: number }> = {
    hybrid: { width: 1200, height: 500 },
    graphic: { width: 1200, height: 900 },
};

/** A `data:` URI we are willing to put in an `src`/`url()`. The assets resolver
 *  is the only producer, but the template refuses anything else so a future
 *  caller cannot smuggle e.g. a `javascript:` or remote URL through the assets
 *  object. */
const DATA_URI_RE = /^data:(?:image\/png|font\/woff2);base64,[A-Za-z0-9+/=]+$/;
const safeDataUri = (raw: string | null | undefined): string | null =>
    typeof raw === 'string' && DATA_URI_RE.test(raw) ? raw : null;

const esc = (raw: string): string =>
    String(raw)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const fontFace = (assets: ReportCardAssets) => {
    const src = safeDataUri(assets.fontDataUri);
    // No font file → no @font-face at all, so the body rule falls straight
    // through to the system sans-serif rather than blocking on a face that
    // will never load (`font-display: block`).
    if (!src) return '';
    return `
@font-face {
  font-family: 'InterCard';
  font-weight: 100 900;
  font-display: block;
  src: url('${src}') format('woff2');
}`;
};

const DEFAULT_MAP_COLOR = '#64748b';

/** Only a strict hex colour is trusted for a `style="...background: X"`
 *  attribute. `slice.color` comes from the stats blob, not a fixed palette,
 *  so anything that isn't `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` is rejected
 *  outright rather than "sanitised" — arbitrary CSS (e.g.
 *  `red;background-image:url(...)`) must never reach a style attribute. */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const safeColor = (raw: string): string => (HEX_COLOR_RE.test(raw) ? raw : DEFAULT_MAP_COLOR);

const mapBar = (model: ReportCardModel) => {
    const total = model.maps.reduce((sum, slice) => sum + slice.value, 0);
    if (total <= 0) return '';
    const segments = model.maps
        .map((slice) => `<span style="flex: ${slice.value}; background: ${safeColor(slice.color)}"></span>`)
        .join('');
    const legend = model.maps
        .map(
            (slice) =>
                `<span class="lg"><i style="background: ${safeColor(slice.color)}"></i>${esc(slice.name)} ${slice.value}</span>`
        )
        .join('');
    return `<div class="mapbar">${segments}</div><div class="legend">${legend}</div>`;
};

const kpi = (label: string, value: string) => `<div class="kpi"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

const sparkline = (model: ReportCardModel) => {
    if (model.fights.length === 0) return '';
    const bars = model.fights
        .map(
            (fight) =>
                `<span data-fight="${esc(fight.label)}" class="${fight.isWin ? 'win' : 'loss'}">${esc(fight.label)}</span>`
        )
        .join('');
    return `<div class="spark">${bars}</div>`;
};

/** Renders the leader's class icon, or a text-abbreviation fallback if the
 *  profession isn't a known one or its icon file could not be read. No
 *  untrusted `leader` data is ever interpolated into inline JS: the `onerror`
 *  handler is a fixed string with no substitutions, and the icon `src` is only
 *  ever a validated `data:image/png;base64,...` looked up by a profession name
 *  that is a member of `KNOWN_PROFESSIONS` (see that const for why). The
 *  abbreviation text itself is escaped and only ever placed in a text node,
 *  never inside a `<script>`-context attribute. */
const leaderIcon = (profession: string, assets: ReportCardAssets): string => {
    const abbrev = esc(getProfessionAbbrev(profession));
    const src = KNOWN_PROFESSIONS.has(profession)
        ? safeDataUri(Object.prototype.hasOwnProperty.call(assets.iconDataUris, profession)
            ? assets.iconDataUris[profession]
            : null)
        : null;
    if (!src) {
        return `<span class="chipicon chipabbrev">${abbrev}</span>`;
    }
    return (
        `<span class="chipicon">` +
        `<img src="${src}" alt="" style="object-fit: contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` +
        `<span class="chipabbrev" style="display:none">${abbrev}</span>` +
        `</span>`
    );
};

/** The boards that actually become chips. Shared with
 *  `collectCardProfessions` so the icons we preload can never drift from the
 *  icons we render. */
const chipBoards = (boards: CardBoard[]): CardBoard[] =>
    boards.filter((board) => board.leaders.length > 0).slice(0, 6);

/** The professions whose icons this card will ask for — the exact input the
 *  (impure) assets resolver needs, computed here so the selection logic lives
 *  in one place. Already filtered by the allow-list, so the resolver never
 *  sees an untrusted string. */
export function collectCardProfessions(model: ReportCardModel, variant: ReportCardVariant): string[] {
    if (variant !== 'graphic') return [];
    const seen = new Set<string>();
    for (const board of chipBoards(model.boards)) {
        const profession = board.leaders[0]?.profession;
        if (profession && KNOWN_PROFESSIONS.has(profession)) seen.add(profession);
    }
    return [...seen];
}

const leaderChips = (boards: CardBoard[], assets: ReportCardAssets) => {
    const chips = chipBoards(boards)
        .map((board) => {
            const leader = board.leaders[0];
            const icon = leader.profession ? leaderIcon(leader.profession, assets) : '';
            return `<div class="chip">${icon}<div><span class="cl">${esc(board.label)}</span><span class="cn">${esc(leader.account)}</span><span class="cv">${esc(leader.value)}</span></div></div>`;
        })
        .join('');
    return chips ? `<div class="chips"><div class="chipshdr">Session leaders</div><div class="chipgrid">${chips}</div></div>` : '';
};

export function renderReportCardHtml(
    model: ReportCardModel,
    variant: ReportCardVariant,
    assets: ReportCardAssets
): string {
    const size = REPORT_CARD_SIZES[variant];
    const tag = model.guildTag ? `<span class="tag">[${esc(model.guildTag)}]</span>` : '';
    const glyphSrc = safeDataUri(assets.glyphDataUri);
    // A missing glyph is simply omitted — no broken-image box, no element to hide.
    const glyph = glyphSrc
        ? `<img src="${glyphSrc}" alt="" style="object-fit: contain" onerror="this.style.display='none'">`
        : '';

    const body = `
<div id="card" class="card ${variant}">
  <div class="hdr">
    <div class="id">${tag}<span class="hl">${esc(model.headline)}</span></div>
    <div class="date">${esc(model.dateLabel)}</div>
  </div>
  <div class="hero">
    <div class="fights"><b>${model.fightCount}</b><span>FIGHT${model.fightCount === 1 ? '' : 'S'}</span></div>
    <div class="record"><b>${esc(model.recordLabel)}</b><span>KDR ${esc(model.squad.kdr)}</span></div>
  </div>
  <div class="kpis">
    ${kpi('Kills', model.squad.kills.toLocaleString('en-US'))}
    ${kpi('Deaths', model.squad.deaths.toLocaleString('en-US'))}
    ${kpi('Avg Squad', String(model.size.squad))}
    ${kpi('Avg Enemy', String(model.size.enemy))}
  </div>
  ${variant === 'graphic'
        ? `<div class="kpis">
    ${kpi('Enemy Downs', model.enemy.downs.toLocaleString('en-US'))}
    ${kpi('Squad Downs', model.squad.downs.toLocaleString('en-US'))}
    ${kpi('Enemy Deaths', model.enemy.deaths.toLocaleString('en-US'))}
    ${kpi('Enemy KDR', model.enemy.kdr)}
  </div>`
        : ''}
  ${mapBar(model)}
  ${variant === 'graphic' ? sparkline(model) : ''}
  ${variant === 'graphic' ? leaderChips(model.boards, assets) : ''}
  <div class="foot">${glyph}AxiBridge</div>
</div>`;

    return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace(assets)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#1a1b1e}
body{font-family:'InterCard',sans-serif;color:#dbdee1;width:${size.width}px}
.card{width:${size.width}px;padding:40px 48px;background:linear-gradient(150deg,#25262b,#1a1b1e);border-left:10px solid #ef4444}
.hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:28px}
.tag{color:#ef4444;font-weight:700;margin-right:12px}
.hl{font-size:30px;font-weight:700;color:#f2f3f5}
.date{font-size:18px;color:#8d95a0}
.hero{display:flex;gap:56px;align-items:flex-end;margin-bottom:30px}
.fights b{font-size:88px;font-weight:700;color:#f2f3f5;line-height:.9}
.fights span{font-size:18px;letter-spacing:.14em;color:#8d95a0;margin-left:14px}
.record b{font-size:36px;font-weight:600;color:#f2f3f5;display:block}
.record span{font-size:18px;color:#8d95a0}
.kpis{display:flex;gap:16px;margin-bottom:22px}
.kpi{flex:1;background:#2b2d31;border-radius:8px;padding:16px 18px}
.kpi b{display:block;font-size:30px;font-weight:600;color:#f2f3f5}
.kpi span{font-size:15px;color:#8d95a0}
.mapbar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin-bottom:12px}
.legend{display:flex;gap:22px;font-size:15px;color:#a3a6aa;margin-bottom:22px}
.lg i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:7px}
.spark{display:flex;gap:6px;margin-bottom:26px}
.spark span{flex:1;text-align:center;font-size:14px;padding:9px 0;border-radius:5px;color:#1a1b1e;font-weight:600}
.spark .win{background:#22c55e}
.spark .loss{background:#ef4444}
.chipshdr{font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#8d95a0;margin-bottom:14px}
.chipgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.chip{display:flex;gap:12px;align-items:center;background:#2b2d31;border-radius:8px;padding:14px 16px}
.chipicon{width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center}
.chipicon img{width:34px;height:34px;object-fit: contain}
.chipabbrev{width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;letter-spacing:.04em;color:#a3a6aa;background:#1f2023;border-radius:6px}
.cl{display:block;font-size:13px;color:#8d95a0}
.cn{display:block;font-size:17px;font-weight:600;color:#f2f3f5}
.cv{display:block;font-size:15px;color:#a3a6aa}
.foot{display:flex;align-items:center;gap:10px;margin-top:28px;font-size:15px;color:#8d95a0}
.foot img{width:24px;height:24px;object-fit: contain}
</style></head><body>${body}</body></html>`;
}
