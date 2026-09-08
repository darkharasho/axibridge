import { coerceReportPostStyle, type IReportWebhook } from '../shared/reportWebhooks';
import type { ReportCardVariant } from './reportCardTemplate';

/** Which card variants a publish actually needs. Rendering is per distinct
 *  style, not per webhook — ten hooks on 'graphic' cost one capture. */
export function planReportCardVariants(webhooks: IReportWebhook[]): ReportCardVariant[] {
    const styles = new Set((webhooks || []).map((hook) => coerceReportPostStyle(hook?.style)));
    const variants: ReportCardVariant[] = [];
    if (styles.has('hybrid')) variants.push('hybrid');
    if (styles.has('graphic')) variants.push('graphic');
    return variants;
}
