import React from 'react';
import ReactDOM from 'react-dom/client';
// The Worker's boot HTML (worker/src/og.ts) is a bare `<body>` with just the
// two `<script>` tags — no stylesheet `<link>`, and no HTML build step here
// to auto-inject one (unlike the `dist-web`/`web/index.html` build). `?inline`
// pulls the fully compiled CSS in as a string so it ships inside this single
// JS module and gets applied via a manually-appended `<style>` tag below.
import indexCss from '../renderer/index.css?inline';
import axiCss from '../renderer/axi-design.css?inline';
import shellCss from './reportShell.css?inline';
import { ReportApp } from './reportApp';
import { ReportErrorBoundary } from './ReportErrorBoundary';
import { setPublicAssetBase } from '../renderer/ui/resolvePublicAssetPath';
import { parseShareBootPayload, ShareBootPayloadError } from './share/shareBootPayload';
import { loadShareReportJson, ShareLoadError } from './share/loadShareReport';
import { buildShareReport } from './share/buildShareReport';
import { expandIconIndex, normalizeCommanderDistance, normalizeTopDownContribution } from '../shared/reportNormalization';
import type { ReportPayload } from '../shared/reportTypes';

const styleTag = document.createElement('style');
// Order matters the same way it does in the renderer's entry: the axi rules
// are written to win on source order where they contest index.css.
styleTag.textContent = `${indexCss}\n${axiCss}\n${shellCss}`;
document.head.appendChild(styleTag);

document.documentElement.classList.add('web-report');
document.body.classList.add('web-report');

/**
 * Where this bundle's sibling static assets (logos, class icons, `logo.json`)
 * live.
 *
 * Derived from `import.meta.url`, NOT from `window.location`: the page is
 * served by the Worker at `<origin>/r/<code>`, which is not a directory and
 * has no assets under it, while this module is served from
 * `<origin>/view/viewer.js` on the GitHub Pages origin. `new URL('.', ...)`
 * therefore yields `<origin>/view/`, a real directory. Passing it explicitly
 * also stops ReportApp probing for an asset base, which under `/r/<code>` can
 * only produce guaranteed-404 requests — two of them against the Worker.
 */
const VIEWER_ASSET_BASE = new URL('.', import.meta.url).href;

// Deep renderer `ui/` components (the commander tag and the Gw2* icons) call
// `resolvePublicAssetPath` directly instead of taking an `assetBase` prop, and
// its pathname sniffing has no case for `/r/<code>`. Point them at the same
// base as ReportApp, once, before anything renders.
setPublicAssetBase(VIEWER_ASSET_BASE);

type ViewerState =
    | { kind: 'loading' }
    | { kind: 'tombstone' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; report: ReportPayload; demoted: boolean };

function InfoCard({
    tone,
    eyebrow,
    title,
    message
}: {
    tone: 'error' | 'warning';
    eyebrow: string;
    title: string;
    message: string;
}) {
    return (
        <div className="report-shell">
            <div className="report-shell-card">
                <div className={`report-shell-cap report-shell-cap--${tone}`} />
                <div className="report-shell-body">
                    <p className={`report-shell-eyebrow report-shell-eyebrow--${tone}`}>{eyebrow}</p>
                    <h1 className="report-shell-title">{title}</h1>
                    <p className="report-shell-text">{message}</p>
                </div>
            </div>
        </div>
    );
}

/**
 * No status cap and no progress bar: a cap is a verdict about the thing and
 * "still working" is not one, and the viewer fetches a single opaque blob with
 * no progress events, so a bar that filled would be inventing the number.
 */
function LoadingCard() {
    return (
        <div className="report-shell">
            <div className="report-shell-card">
                <div className="report-shell-body">
                    <div className="report-shell-loading">
                        <span className="report-shell-mark" aria-hidden="true" />
                        <div>
                            <p className="report-shell-eyebrow report-shell-eyebrow--info">AxiBridge</p>
                            <h1 className="report-shell-title" style={{ margin: 0 }}>
                                Loading report…
                            </h1>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Deliberately hedged copy. `stage: 'demoted'` is only a LABEL today — nothing
 * in the pipeline rewrites the stored object with `combatReplay` stripped (see
 * the "not yet implemented" note in src/main/shareRetention.ts), so the bytes
 * this viewer just decoded may well still contain the replay and render it.
 * Saying replay "is not included" would therefore be a flat contradiction of
 * what is on screen. Once stripping ships, this can be made definite again.
 */
function DemotedBanner() {
    return (
        <div className="report-shell-banner" role="status">
            This report was demoted to save storage space, so map replay data may be unavailable.
        </div>
    );
}

const readBootPayloadElementText = (): string | null => {
    const el = document.getElementById('axibridge-share');
    return el ? el.textContent : null;
};

function ViewerRoot() {
    const [state, setState] = React.useState<ViewerState>({ kind: 'loading' });

    React.useEffect(() => {
        let cancelled = false;

        (async () => {
            let payload;
            try {
                payload = parseShareBootPayload(readBootPayloadElementText());
            } catch (err) {
                if (!cancelled) {
                    setState({
                        kind: 'error',
                        message: err instanceof ShareBootPayloadError ? err.message : 'This share link is broken.'
                    });
                }
                return;
            }

            if (payload === null) {
                if (!cancelled) setState({ kind: 'tombstone' });
                return;
            }

            try {
                const raw = await loadShareReportJson(payload.loc);
                const report = buildShareReport(raw);
                const normalized = expandIconIndex(
                    normalizeTopDownContribution(normalizeCommanderDistance(report))
                );
                if (!cancelled) {
                    setState({ kind: 'ready', report: normalized, demoted: payload.stage === 'demoted' });
                }
            } catch (err) {
                if (!cancelled) {
                    setState({
                        kind: 'error',
                        message:
                            err instanceof ShareLoadError || err instanceof Error
                                ? err.message
                                : 'Failed to load this report.'
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    switch (state.kind) {
        case 'loading':
            return <LoadingCard />;
        case 'tombstone':
            return (
                <InfoCard
                    tone="warning"
                    eyebrow="Unavailable"
                    title="This report is no longer available"
                    message="The person who shared this link removed the underlying report, or it aged out of storage."
                />
            );
        case 'error':
            return (
                <InfoCard
                    tone="error"
                    eyebrow="Couldn't load"
                    title="Couldn't load this report"
                    message={state.message}
                />
            );
        case 'ready':
            return (
                <>
                    {state.demoted && <DemotedBanner />}
                    <ReportApp injectedSource={{ report: state.report }} assetBase={VIEWER_ASSET_BASE} />
                </>
            );
        default:
            return null;
    }
}

const resolveRootElement = (): HTMLElement => {
    const existing = document.getElementById('root');
    if (existing) return existing;
    const created = document.createElement('div');
    created.id = 'root';
    document.body.appendChild(created);
    return created;
};

ReactDOM.createRoot(resolveRootElement()).render(
    <React.StrictMode>
        <ReportErrorBoundary>
            <ViewerRoot />
        </ReportErrorBoundary>
    </React.StrictMode>
);
