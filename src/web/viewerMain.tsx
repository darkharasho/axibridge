import React from 'react';
import ReactDOM from 'react-dom/client';
// The Worker's boot HTML (worker/src/og.ts) is a bare `<body>` with just the
// two `<script>` tags — no stylesheet `<link>`, and no HTML build step here
// to auto-inject one (unlike the `dist-web`/`web/index.html` build). `?inline`
// pulls the fully compiled CSS in as a string so it ships inside this single
// JS module and gets applied via a manually-appended `<style>` tag below.
import indexCss from '../renderer/index.css?inline';
import { ReportApp } from './reportApp';
import { setPublicAssetBase } from '../renderer/ui/resolvePublicAssetPath';
import { parseShareBootPayload, ShareBootPayloadError } from './share/shareBootPayload';
import { loadShareReportJson, ShareLoadError } from './share/loadShareReport';
import { buildShareReport } from './share/buildShareReport';
import { expandIconIndex, normalizeCommanderDistance, normalizeTopDownContribution } from '../shared/reportNormalization';
import type { ReportPayload } from '../shared/reportTypes';

const styleTag = document.createElement('style');
styleTag.textContent = indexCss;
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

const cardWrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#0b1120',
    color: '#e2e8f0',
    fontFamily: 'system-ui, -apple-system, sans-serif'
};

const cardStyle: React.CSSProperties = {
    maxWidth: 480,
    padding: 32,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(15,23,42,0.92)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
};

function InfoCard({ title, message }: { title: string; message: string }) {
    return (
        <div style={cardWrapperStyle}>
            <div style={cardStyle}>
                <h1 style={{ fontSize: 20, marginBottom: 12, fontWeight: 600 }}>{title}</h1>
                <p style={{ color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>{message}</p>
            </div>
        </div>
    );
}

function LoadingCard() {
    return (
        <div style={cardWrapperStyle}>
            <div style={cardStyle}>
                <p style={{ margin: 0 }}>Loading report…</p>
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
        <div
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                padding: '8px 16px',
                background: '#7c2d12',
                color: '#fed7aa',
                fontSize: 13,
                textAlign: 'center'
            }}
            role="status"
        >
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
                    title="This report is no longer available"
                    message="The person who shared this link removed the underlying report, or it aged out of storage."
                />
            );
        case 'error':
            return <InfoCard title="Couldn't load this report" message={state.message} />;
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
        <ViewerRoot />
    </React.StrictMode>
);
