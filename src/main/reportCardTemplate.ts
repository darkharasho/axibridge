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
                `<span class="lg"><i style="background: ${safeColor(slice.color)}"></i>${esc(slice.name)} <b>${slice.value}</b></span>`
        )
        .join('');
    return `<div class="maps"><div class="mapbar">${segments}</div><div class="legend">${legend}</div></div>`;
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
    return `<div class="sparkhdr">Fight timeline</div><div class="spark">${bars}</div>`;
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

/** The chip's accent colour. Read from the same `PROFESSION_COLORS` table the
 *  rest of the app uses, then put through `safeColor` — the table is ours, but
 *  the profession key is log-controlled and the value lands in a `style`
 *  attribute, so an unrecognised class falls back to the neutral grey rather
 *  than reaching CSS unchecked. */
const chipAccent = (profession: string | undefined): string =>
    safeColor(profession ? PROFESSION_COLORS[profession] ?? '' : '');

const leaderChips = (boards: CardBoard[], assets: ReportCardAssets) => {
    const chips = chipBoards(boards)
        .map((board) => {
            const leader = board.leaders[0];
            const icon = leader.profession ? leaderIcon(leader.profession, assets) : '';
            return `<div class="chip" style="--pc: ${chipAccent(leader.profession)}">${icon}<div><span class="cl">${esc(board.label)}</span><span class="cn">${esc(leader.account)}</span><span class="cv">${esc(leader.value)}</span></div></div>`;
        })
        .join('');
    return chips ? `<div class="chips"><div class="chipshdr">Session leaders</div><div class="chipgrid">${chips}</div></div>` : '';
};

/** `recordLabel` is built as `<n>W – <n>L` by the model. Splitting it here lets
 *  the win and loss halves take their own colours; anything that doesn't match
 *  that exact shape is rendered whole, so a future label format degrades to
 *  plain text rather than to garbled markup. */
const RECORD_RE = /^(\d+W)\s*(\u2013|-)\s*(\d+L)$/;
const recordMarkup = (label: string): string => {
    const parts = RECORD_RE.exec(label);
    if (!parts) return esc(label);
    return `<span class="w">${esc(parts[1])}</span> <span class="dash">${esc(parts[2])}</span> <span class="l">${esc(parts[3])}</span>`;
};

export function renderReportCardHtml(
    model: ReportCardModel,
    variant: ReportCardVariant,
    assets: ReportCardAssets
): string {
    const size = REPORT_CARD_SIZES[variant];
    const tag = model.guildTag ? `<span class="tag">${esc(model.guildTag)}</span>` : '';
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
    <div class="vr"></div>
    <div class="record">
      <b>${recordMarkup(model.recordLabel)}</b>
      <span class="kdr"><i>KDR</i> ${esc(model.squad.kdr)}</span>
    </div>
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
html,body{background:#0d0e11}
body{font-family:'InterCard',sans-serif;color:#dbdee1;width:${size.width}px;-webkit-font-smoothing:antialiased}

/* Four coloured pools plus a base gradient. Layered rather than painted as one
   sweep so no single hue dominates: warm top-left, cool top-right, and a
   violet/green floor that keeps the tall "graphic" variant from fading to a
   flat grey below the fold. */
.card{position:relative;width:${size.width}px;padding:44px 52px 38px;overflow:hidden;
  background:
    radial-gradient(760px 520px at 2% -14%, rgba(239,68,68,.34), transparent 64%),
    radial-gradient(680px 460px at 30% 106%, rgba(168,85,247,.24), transparent 66%),
    radial-gradient(720px 520px at 100% 4%, rgba(56,189,248,.24), transparent 64%),
    radial-gradient(620px 480px at 78% 108%, rgba(34,197,94,.16), transparent 66%),
    linear-gradient(155deg,#232532 0%,#171a22 44%,#0f1116 100%)}
/* A faint grid, masked to the top-left so it reads as texture behind the
   header and fades out before it can fight the leaderboard chips. */
.card::before{content:'';position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.032) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.032) 1px,transparent 1px);
  background-size:44px 44px;mask-image:radial-gradient(900px 620px at 20% 6%,#000,transparent 74%)}
.card > *{position:relative}

.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px}
.id{display:flex;align-items:center;gap:14px}
.tag{font-size:16px;font-weight:800;letter-spacing:.06em;color:#fca5a5;background:rgba(239,68,68,.18);
  border:1px solid rgba(239,68,68,.38);border-radius:7px;padding:5px 11px}
.hl{font-size:31px;font-weight:700;color:#f7f8fa;letter-spacing:-.015em}
.date{font-size:15px;color:#8d95a1;font-variant-numeric:tabular-nums}

.hero{display:flex;align-items:stretch;gap:40px;margin-bottom:32px}
.fights{display:flex;align-items:flex-end;gap:16px}
.fights b{font-size:104px;font-weight:800;line-height:.8;letter-spacing:-.05em;
  background:linear-gradient(178deg,#ffffff 34%,#fda4af 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 6px 26px rgba(239,68,68,.45))}
.fights span{font-size:15px;font-weight:700;letter-spacing:.22em;color:#8d95a1;padding-bottom:9px}
.vr{width:1px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.2),transparent)}
.record{display:flex;flex-direction:column;justify-content:flex-end;gap:10px}
.record b{font-size:44px;font-weight:800;letter-spacing:-.025em;line-height:1;color:#f7f8fa}
.record .w{color:#4ade80}
.record .l{color:#f87171}
.record .dash{color:#5a616c;font-weight:400}
.kdr{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:#e6e9ee;
  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:5px 13px;font-variant-numeric:tabular-nums}
.kdr i{font-style:normal;color:#8d95a1;font-weight:700;letter-spacing:.14em;font-size:10px}

.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px}
.kpi{position:relative;background:linear-gradient(165deg,rgba(255,255,255,.085),rgba(255,255,255,.028));
  border:1px solid rgba(255,255,255,.09);border-radius:11px;padding:15px 17px 14px;overflow:hidden}
.kpi::before{content:'';position:absolute;left:0;right:0;top:0;height:2px;
  background:linear-gradient(90deg,rgba(255,255,255,.34),transparent 78%)}
.kpi b{display:block;font-size:31px;font-weight:700;color:#f7f8fa;letter-spacing:-.025em;font-variant-numeric:tabular-nums}
.kpi span{display:block;margin-top:2px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#8d95a1}

.maps{margin:22px 0 26px}
.mapbar{display:flex;gap:3px;height:11px;margin-bottom:13px}
.mapbar span{border-radius:2px}
.mapbar span:first-child{border-radius:6px 2px 2px 6px}
.mapbar span:last-child{border-radius:2px 6px 6px 2px}
.legend{display:flex;gap:9px;flex-wrap:wrap}
.lg{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:#a6aeb9;
  background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:4px 11px}
.lg i{width:8px;height:8px;border-radius:2px;display:inline-block}
.lg b{color:#e6e9ee;font-weight:700;font-variant-numeric:tabular-nums}

.sparkhdr,.chipshdr{display:flex;align-items:center;gap:12px;font-size:11px;font-weight:700;letter-spacing:.18em;
  text-transform:uppercase;color:#79818d;margin-bottom:12px}
.sparkhdr::after,.chipshdr::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.12),transparent)}
.spark{display:flex;gap:4px;margin-bottom:28px}
.spark span{flex:1;text-align:center;font-size:11px;font-weight:700;padding:7px 0;border-radius:4px;color:#0d0e11}
.spark .win{background:linear-gradient(180deg,#4ade80,#16a34a);box-shadow:0 0 12px -4px #22c55e}
.spark .loss{background:linear-gradient(180deg,#f87171,#dc2626);box-shadow:0 0 12px -4px #ef4444}

.chipgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:13px}
/* --pc is the leader's profession colour, set per chip by chipAccent(). It
   tints the fill, border, icon well, and label, so each chip reads as its
   class at a glance. */
.chip{position:relative;display:flex;gap:13px;align-items:center;padding:13px 15px;border-radius:11px;overflow:hidden;
  background:linear-gradient(120deg,color-mix(in srgb,var(--pc) 20%,transparent),rgba(255,255,255,.035) 64%);
  border:1px solid color-mix(in srgb,var(--pc) 24%,rgba(255,255,255,.08))}
.chip::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--pc)}
.chipicon{position:relative;width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;
  border-radius:9px;background:color-mix(in srgb,var(--pc) 24%,rgba(0,0,0,.4));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 40%,transparent)}
.chipicon img{width:26px;height:26px;object-fit: contain}
.chipabbrev{width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;font-size:12px;
  font-weight:800;letter-spacing:.04em;color:#e6e9ee;border-radius:9px;
  background:color-mix(in srgb,var(--pc) 24%,rgba(0,0,0,.4));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 40%,transparent)}
.cl{display:block;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--pc)}
.cn{display:block;font-size:16px;font-weight:600;color:#f7f8fa;margin-top:1px}
.cv{display:block;font-size:14px;font-weight:600;color:#a6aeb9;font-variant-numeric:tabular-nums}

.foot{display:flex;align-items:center;gap:10px;margin-top:30px;padding-top:18px;font-size:12px;font-weight:600;
  letter-spacing:.1em;text-transform:uppercase;color:#6d7581;border-top:1px solid rgba(255,255,255,.09)}
.foot img{width:20px;height:20px;object-fit: contain;opacity:.8}
</style></head><body>${body}</body></html>`;
}
