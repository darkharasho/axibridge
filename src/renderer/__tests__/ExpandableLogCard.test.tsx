import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExpandableLogCard } from '../ExpandableLogCard';
import { DetailsCacheProvider } from '../cache/DetailsCacheContext';
import { DetailsCache } from '../cache/DetailsCache';
// Real EI export with 55 raw players[] entries: 40 raw squad entries (one
// account relogged 3x -> 38 distinct people) + 15 raw ally entries (15
// distinct people, no dupes) -> 53 distinct people total. Read at runtime
// rather than `import`ed: a static import hands `tsc --noEmit` a ~38 MB
// structural literal to infer and blows the typecheck heap budget.
const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), 'test-fixtures/boon/20260128-190427.json'), 'utf8'),
);

function cacheWith(logId: string, details: unknown): DetailsCache {
    const cache = new DetailsCache({ fetchDetails: async () => null });
    cache.putMemoryOnly(logId, details);
    return cache;
}

describe('ExpandableLogCard headline player count', () => {
    it('sums distinct squad+pug primaries, not raw players[] entries, once details are loaded', () => {
        const log = { id: 'log-1', status: 'success', playerCount: 999 };
        const cache = cacheWith('log-1', fixture);
        render(
            <DetailsCacheProvider cache={cache}>
                <ExpandableLogCard
                    log={log}
                    isExpanded
                    onToggle={() => {}}
                    motionEnabled={false}
                    particlesEnabled={false}
                />
            </DetailsCacheProvider>
        );
        expect(screen.getByText('53 Players (38 +15)')).toBeInTheDocument();
        expect(screen.queryByText('55 Players (38 +15)')).not.toBeInTheDocument();
    });

    it('falls back to the raw log.playerCount when details are not yet loaded', () => {
        const log = { id: 'log-2', status: 'success', playerCount: 12 };
        render(
            <ExpandableLogCard
                log={log}
                isExpanded={false}
                onToggle={() => {}}
                motionEnabled={false}
                particlesEnabled={false}
            />
        );
        expect(screen.getByText('12 Players')).toBeInTheDocument();
    });
});

describe('ExpandableLogCard report link', () => {
    const renderCard = (log: any) => render(
        <ExpandableLogCard
            log={log}
            isExpanded
            onToggle={() => {}}
            motionEnabled={false}
            particlesEnabled={false}
        />
    );

    const SHARE = 'https://bridge.axi.link/r/k3Xm9qR2';
    const PERMALINK = 'https://dps.report/abc-123';

    it('opens the share link, and names it as ours, when one exists', () => {
        renderCard({ id: 'l', status: 'success', shareUrl: SHARE, permalink: PERMALINK });
        const button = screen.getByRole('button', { name: /Open Fight Report/ });
        expect(button).toBeEnabled();
        expect(screen.queryByText(/dps\.report/)).not.toBeInTheDocument();
    });

    // Thousands of logs persisted before share links existed carry only a
    // permalink. The change is additive: they must keep working untouched.
    it('falls back to the permalink, still named dps.report', () => {
        renderCard({ id: 'l', status: 'success', permalink: PERMALINK });
        expect(screen.getByRole('button', { name: /Open dps\.report Report/ })).toBeEnabled();
    });

    it('disables the button when the log has neither link', () => {
        renderCard({ id: 'l', status: 'success' });
        expect(screen.getByRole('button', { name: /Link Pending/ })).toBeDisabled();
    });

    it('treats a blank share link as absent rather than opening an empty url', () => {
        renderCard({ id: 'l', status: 'success', shareUrl: '   ', permalink: PERMALINK });
        expect(screen.getByRole('button', { name: /Open dps\.report Report/ })).toBeEnabled();
    });
});

// The automatic mint on the parse path is the only other place a share link is
// created, so for a log that predates share links -- or whose automatic mint
// failed -- this button is the ONLY way one ever appears.
describe('ExpandableLogCard share action', () => {
    const SHARE = 'https://bridge.axi.link/r/k3Xm9qR2';
    const PERMALINK = 'https://dps.report/abc-123';

    // The shared setup defines `window.electronAPI` with `configurable: false`,
    // so this stub is assigned over it and assigned back -- `delete` throws.
    const realElectronAPI = (window as any).electronAPI;
    const stubShareLog = (shareLog: any) => {
        (window as any).electronAPI = { ...realElectronAPI, shareLog };
        return shareLog;
    };
    afterEach(() => {
        (window as any).electronAPI = realElectronAPI;
    });

    const renderShareCard = (log: any, onShared?: (patch: any) => void) => render(
        <ExpandableLogCard
            log={log}
            isExpanded
            onToggle={() => {}}
            onShared={onShared}
            motionEnabled={false}
            particlesEnabled={false}
        />
    );

    const shareButton = () => screen.getByRole('button', { name: /Create Share Link/ });

    it('offers to mint a link for a log that has none', () => {
        renderShareCard({ id: 'l', filePath: '/logs/a.zevtc', status: 'success', permalink: PERMALINK });
        expect(shareButton()).toBeEnabled();
    });

    it('hides the action once the log already has a share link', () => {
        renderShareCard({ id: 'l', filePath: '/logs/a.zevtc', status: 'success', shareUrl: SHARE });
        expect(screen.queryByRole('button', { name: /Create Share Link/ })).not.toBeInTheDocument();
    });

    it('hands the minted url to the parent, keyed by file path', async () => {
        const shareLog = stubShareLog(vi.fn().mockResolvedValue({ success: true, url: SHARE, code: 'k3Xm9qR2' }));
        const onShared = vi.fn();
        renderShareCard({ id: 'l', filePath: '/logs/a.zevtc', status: 'success' }, onShared);

        fireEvent.click(shareButton());

        await waitFor(() => expect(onShared).toHaveBeenCalledWith({ shareUrl: SHARE, shareId: 'k3Xm9qR2' }));
        expect(shareLog).toHaveBeenCalledWith('/logs/a.zevtc');
    });

    // `share-log` resolves `{ success: false, error }` instead of throwing, so a
    // failed share must surface as visible copy rather than a silent no-op.
    it('shows the reason a share failed and tells the parent nothing', async () => {
        stubShareLog(vi.fn().mockResolvedValue({ success: false, error: 'Connect GitHub in Settings.' }));
        const onShared = vi.fn();
        renderShareCard({ id: 'l', filePath: '/logs/a.zevtc', status: 'success' }, onShared);

        fireEvent.click(shareButton());

        await screen.findByRole('alert');
        expect(screen.getByRole('alert')).toHaveTextContent('Connect GitHub in Settings.');
        expect(onShared).not.toHaveBeenCalled();
    });
});
