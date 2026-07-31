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

/** The report webhooks a publish should post to. `selectedIds` is the user's
 *  per-publish choice: an array narrows to those ids, [] means post to none
 *  (report-only), and undefined/null falls back to every enabled hook (the
 *  pre-selection behavior, kept for back-compat callers). Disabled and url-less
 *  hooks are never eligible, even if explicitly selected. */
export const selectReportWebhooks = (
    webhooks: IReportWebhook[],
    selectedIds?: string[] | null
): IReportWebhook[] => {
    const eligible = (webhooks || []).filter((hook) => hook && hook.enabled && hook.url);
    if (selectedIds == null) return eligible;
    const selected = new Set(selectedIds);
    return eligible.filter((hook) => selected.has(hook.id));
};

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
