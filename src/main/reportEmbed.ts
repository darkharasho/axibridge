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

const kpiFields = (model: ReportCardModel): DiscordEmbedField[] => [
    {
        name: '⚔️ Squad',
        value: `${model.squad.kills.toLocaleString('en-US')} kills · ${model.squad.downs.toLocaleString('en-US')} downs\n${model.squad.deaths.toLocaleString('en-US')} deaths\nKDR **${model.squad.kdr}**`,
        inline: true,
    },
    {
        name: '🛡️ Enemy',
        value: `${model.enemy.kills.toLocaleString('en-US')} kills · ${model.enemy.downs.toLocaleString('en-US')} downs\n${model.enemy.deaths.toLocaleString('en-US')} deaths\nKDR **${model.enemy.kdr}**`,
        inline: true,
    },
    {
        name: '👥 Size',
        value: `Squad avg **${model.size.squad}**\nEnemy avg **${model.size.enemy}**`,
        inline: true,
    },
];

const mapField = (model: ReportCardModel): DiscordEmbedField[] => {
    if (model.maps.length === 0) return [];
    const value = model.maps.map((slice) => `${slice.name} ${slice.value}`).join(' · ');
    return [{ name: '🗺️ Maps', value: clampValue(value), inline: false }];
};

const boardFields = (model: ReportCardModel): DiscordEmbedField[] =>
    model.boards
        .filter((board) => board.leaders.length > 0)
        .map((board) => ({
            name: board.label,
            value: clampValue(
                board.leaders.map((leader) => `${leader.rank}. ${leader.account} — ${leader.value}`).join('\n')
            ),
            inline: true,
        }));

/** Truncation is deterministic: KPI and map fields are kept, then boards are
 *  appended while both the field count and the character budget allow. Boards
 *  drop from the tail of REPORT_CARD_BOARDS order, so the same model always
 *  produces the same embed. */
const fitFields = (
    required: DiscordEmbedField[],
    optional: DiscordEmbedField[],
    fixedChars: number
): DiscordEmbedField[] => {
    const out: DiscordEmbedField[] = [];
    let chars = fixedChars;
    for (const field of required) {
        if (out.length >= DISCORD_EMBED_FIELD_LIMIT) break;
        if (chars + fieldCost(field) > CHAR_BUDGET) break;
        out.push(field);
        chars += fieldCost(field);
    }
    for (const field of optional) {
        if (out.length >= DISCORD_EMBED_FIELD_LIMIT) break;
        if (chars + fieldCost(field) > CHAR_BUDGET) continue;
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
