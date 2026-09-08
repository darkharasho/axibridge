import type { ReportCardModel } from '../shared/reportCardModel';
import type { ReportPostStyle } from '../shared/reportWebhooks';

export const REPORT_CARD_FILENAME = 'report-card.png';

export const DISCORD_EMBED_FIELD_LIMIT = 25;
export const DISCORD_EMBED_CHAR_LIMIT = 6000;
const DISCORD_FIELD_VALUE_LIMIT = 1024;
/** Headroom under the hard cap so a long title or footer can never tip us over. */
const CHAR_BUDGET = 5500;

export interface DiscordEmbedField { name: string; value: string; inline?: boolean }

export interface DiscordEmbed {
    title: string;
    url: string;
    color: number;
    description?: string;
    fields?: DiscordEmbedField[];
    footer?: { text: string };
    image?: { url: string };
}

const EMBED_COLOR = 0xef4444;

const fieldCost = (field: DiscordEmbedField) => field.name.length + field.value.length;

const clampValue = (value: string) =>
    value.length <= DISCORD_FIELD_VALUE_LIMIT ? value : `${value.slice(0, DISCORD_FIELD_VALUE_LIMIT - 1)}…`;

/** Discord lays inline fields out in columns, and a report is often read in a
 *  narrow container — a forum channel's post sidebar, a docked window, a phone.
 *  Proportional text in a ~15-character column wraps in the middle of an
 *  account name (`Quantumized.58 / 73`), which is what made the plain
 *  `1. name — value` rows unreadable there.
 *
 *  Every multi-row value is therefore a fenced code block: Discord renders it
 *  monospaced and does not reflow it, so a row either fits or is clipped at
 *  the column edge, but never wraps into a second ragged line. Names are
 *  truncated to a fixed width and values are padded to a common width, so the
 *  numbers line up as a real column at any container size. */
const BOARD_NAME_WIDTH = 13;
/** Fences plus the two newlines they sit on. */
const CODE_FENCE_COST = 8;

const truncateName = (raw: string): string =>
    raw.length <= BOARD_NAME_WIDTH ? raw : `${raw.slice(0, BOARD_NAME_WIDTH - 1)}…`;

/** Fences `rows`, dropping rows from the tail until the fenced block fits a
 *  field value. Clamping the fenced string instead would cut off the closing
 *  fence and leak code-block syntax into the post. */
const codeBlock = (rows: string[]): string => {
    const kept = [...rows];
    while (kept.length > 1 && kept.join('\n').length + CODE_FENCE_COST > DISCORD_FIELD_VALUE_LIMIT) {
        kept.pop();
    }
    return `\`\`\`\n${clampValue(kept.join('\n'))}\n\`\`\``;
};

/** `label -> value` rows padded into two aligned monospace columns. Shared by
 *  the KPI fields so squad and enemy read as the same shape side by side. */
const statRows = (entries: Array<[string, string]>): string[] => {
    const width = Math.max(...entries.map(([, value]) => value.length));
    return entries.map(([label, value]) => `${value.padStart(width)}  ${label}`);
};

const kpiFields = (model: ReportCardModel): DiscordEmbedField[] => [
    {
        name: '⚔️ Squad',
        value: codeBlock(
            statRows([
                ['kills', model.squad.kills.toLocaleString('en-US')],
                ['downs', model.squad.downs.toLocaleString('en-US')],
                ['deaths', model.squad.deaths.toLocaleString('en-US')],
                ['KDR', model.squad.kdr],
            ])
        ),
        inline: true,
    },
    {
        name: '🛡️ Enemy',
        value: codeBlock(
            statRows([
                ['kills', model.enemy.kills.toLocaleString('en-US')],
                ['downs', model.enemy.downs.toLocaleString('en-US')],
                ['deaths', model.enemy.deaths.toLocaleString('en-US')],
                ['KDR', model.enemy.kdr],
            ])
        ),
        inline: true,
    },
    {
        name: '👥 Size',
        value: codeBlock(
            statRows([
                ['avg squad', String(model.size.squad)],
                ['avg enemy', String(model.size.enemy)],
            ])
        ),
        inline: true,
    },
];

const mapField = (model: ReportCardModel): DiscordEmbedField[] => {
    if (model.maps.length === 0) return [];
    const width = Math.max(...model.maps.map((slice) => String(slice.value).length));
    const rows = model.maps.map((slice) => `${String(slice.value).padStart(width)}  ${slice.name}`);
    return [{ name: '🗺️ Maps', value: codeBlock(rows), inline: false }];
};

const boardFields = (model: ReportCardModel): DiscordEmbedField[] =>
    model.boards
        .filter((board) => board.leaders.length > 0)
        .map((board) => {
            const leaders = board.leaders.map((leader) => ({
                rank: String(leader.rank),
                name: truncateName(leader.account),
                value: leader.value,
            }));
            const nameWidth = Math.max(...leaders.map((leader) => leader.name.length));
            const valueWidth = Math.max(...leaders.map((leader) => leader.value.length));
            const rows = leaders.map(
                (leader) =>
                    `${leader.rank} ${leader.name.padEnd(nameWidth)} ${leader.value.padStart(valueWidth)}`
            );
            return { name: board.label, value: codeBlock(rows), inline: true };
        });

/** Truncation is deterministic. Required (KPI/map) fields are each tried in
 *  order and skipped individually if they would blow the budget, so one
 *  oversized field never knocks out the ones after it. Optional (board)
 *  fields are appended in REPORT_CARD_BOARDS order and STOP at the first one
 *  that doesn't fit — later, possibly-smaller boards are never pulled in out
 *  of order — so boards only ever drop from the tail of the fixed order and
 *  the same model always produces the same embed. */
const fitFields = (
    required: DiscordEmbedField[],
    optional: DiscordEmbedField[],
    fixedChars: number
): DiscordEmbedField[] => {
    const out: DiscordEmbedField[] = [];
    let chars = fixedChars;
    for (const field of required) {
        if (out.length >= DISCORD_EMBED_FIELD_LIMIT) break;
        if (chars + fieldCost(field) > CHAR_BUDGET) continue;
        out.push(field);
        chars += fieldCost(field);
    }
    for (const field of optional) {
        if (out.length >= DISCORD_EMBED_FIELD_LIMIT) break;
        if (chars + fieldCost(field) > CHAR_BUDGET) break;
        out.push(field);
        chars += fieldCost(field);
    }
    return out;
};

export function buildReportEmbed(args: {
    model: ReportCardModel;
    style: ReportPostStyle;
    title: string;
    url: string;
    hasImage: boolean;
}): DiscordEmbed {
    const { model, title, url, hasImage } = args;
    // A graphic style with no rendered card degrades to the text layout, which
    // is the whole fallback contract: a failed capture never costs the link.
    const style = args.style !== 'text' && !hasImage ? 'text' : args.style;

    const description = [
        model.fightCount > 0 ? `**${model.fightCount} fight${model.fightCount === 1 ? '' : 's'}**` : '',
        model.recordLabel,
    ]
        .filter(Boolean)
        .join(' · ');

    const embed: DiscordEmbed = { title, url, color: EMBED_COLOR };
    if (description) embed.description = description;
    if (model.dateLabel) embed.footer = { text: model.dateLabel };
    if (style !== 'text') embed.image = { url: `attachment://${REPORT_CARD_FILENAME}` };

    if (style === 'graphic') {
        embed.fields = [];
        return embed;
    }

    const fixedChars = title.length + description.length + model.dateLabel.length;
    embed.fields = fitFields([...kpiFields(model), ...mapField(model)], boardFields(model), fixedChars);
    return embed;
}
