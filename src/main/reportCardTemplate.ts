import path from 'path';
import { pathToFileURL } from 'url';
import type { CardBoard, ReportCardModel } from '../shared/reportCardModel';

export type ReportCardVariant = 'hybrid' | 'graphic';

export interface ReportCardAssets {
    fontDir: string;
    iconDir: string;
    glyphPath: string;
}

/** Authored at ~2x Discord's embed image width so the capture downsamples
 *  crisply. `height` is a starting box; the renderer measures the real content
 *  height before capturing. */
export const REPORT_CARD_SIZES: Record<ReportCardVariant, { width: number; height: number }> = {
    hybrid: { width: 1200, height: 500 },
    graphic: { width: 1200, height: 900 },
};

export function resolveReportCardAssets(publicDir: string): ReportCardAssets {
    return {
        fontDir: path.join(publicDir, 'fonts'),
        iconDir: path.join(publicDir, 'img', 'class-icons'),
        glyphPath: path.join(publicDir, 'img', 'AxiBridge-glyph.png'),
    };
}

const fileUrl = (p: string) => pathToFileURL(p).href;

const esc = (raw: string): string =>
    String(raw)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const fontFace = (assets: ReportCardAssets) => `
@font-face {
  font-family: 'InterCard';
  font-weight: 100 900;
  font-display: block;
  src: url('${fileUrl(path.join(assets.fontDir, 'InterVariable.woff2'))}') format('woff2');
}`;

const mapBar = (model: ReportCardModel) => {
    const total = model.maps.reduce((sum, slice) => sum + slice.value, 0);
    if (total <= 0) return '';
    const segments = model.maps
        .map((slice) => `<span style="flex: ${slice.value}; background: ${esc(slice.color)}"></span>`)
        .join('');
    const legend = model.maps
        .map(
            (slice) =>
                `<span class="lg"><i style="background: ${esc(slice.color)}"></i>${esc(slice.name)} ${slice.value}</span>`
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

const leaderChips = (boards: CardBoard[], assets: ReportCardAssets) => {
    const chips = boards
        .filter((board) => board.leaders.length > 0)
        .slice(0, 6)
        .map((board) => {
            const leader = board.leaders[0];
            const icon = leader.profession
                ? `<img src="${fileUrl(path.join(assets.iconDir, `${leader.profession}.png`))}" alt="" style="object-fit: contain" onerror="this.replaceWith(document.createTextNode('${esc(leader.profession.slice(0, 2).toUpperCase())}'))">`
                : '';
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
  <div class="foot"><img src="${fileUrl(assets.glyphPath)}" alt="" style="object-fit: contain" onerror="this.style.display='none'">AxiBridge</div>
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
.chip img{width:34px;height:34px;object-fit: contain;flex:0 0 34px}
.cl{display:block;font-size:13px;color:#8d95a0}
.cn{display:block;font-size:17px;font-weight:600;color:#f2f3f5}
.cv{display:block;font-size:15px;color:#a3a6aa}
.foot{display:flex;align-items:center;gap:10px;margin-top:28px;font-size:15px;color:#8d95a0}
.foot img{width:24px;height:24px;object-fit: contain}
</style></head><body>${body}</body></html>`;
}
