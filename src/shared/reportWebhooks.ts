export interface IReportWebhook {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    isForum: boolean;
    titleTemplate: string;
}

export const DEFAULT_REPORT_TITLE_TEMPLATE = '{date} - {day_of_week} - {commander}';

export const makeDefaultReportWebhook = (id: string): IReportWebhook => ({
    id,
    name: '',
    url: '',
    enabled: true,
    isForum: false,
    titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE,
});

export interface ReportTitleContext {
    /** First fight's start time — names the raid night even past midnight. */
    sessionStart: Date;
    primaryCommander: string;
    commanders: string[];
}

export const renderReportTitle = (template: string, ctx: ReportTitleContext): string => {
    const effective = template && template.trim() ? template : DEFAULT_REPORT_TITLE_TEMPLATE;
    const pad = (value: number) => String(value).padStart(2, '0');
    const date = `${pad(ctx.sessionStart.getMonth() + 1)}/${pad(ctx.sessionStart.getDate())}/${pad(ctx.sessionStart.getFullYear() % 100)}`;
    const dayOfWeek = ctx.sessionStart.toLocaleDateString(undefined, { weekday: 'long' });
    const commander = ctx.primaryCommander || 'Unknown';
    const commanders = ctx.commanders.length ? ctx.commanders.join(', ') : 'Unknown';
    return effective
        .replaceAll('{date}', date)
        .replaceAll('{day_of_week}', dayOfWeek)
        .replaceAll('{commanders}', commanders)
        .replaceAll('{commander}', commander)
        .trim();
};
