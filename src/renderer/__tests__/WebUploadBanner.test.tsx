import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebUploadBanner } from '../stats/ui/WebUploadBanner';

const setupClipboard = () => {
    Object.assign(navigator, {
        clipboard: { writeText: vi.fn() }
    });
};

describe('WebUploadBanner', () => {
    beforeEach(() => {
        setupClipboard();
    });

    it('renders nothing when embedded', () => {
        const { container } = render(
            <WebUploadBanner
                embedded
                webUploadMessage="Uploaded: https://foo.github.io/?report=abc"
                webUploadUrl="https://foo.github.io/?report=abc"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders nothing when no message', () => {
        const { container } = render(
            <WebUploadBanner
                embedded={false}
                webUploadBuildStatus="idle"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('Copy button copies short URL when available (no Copy Short button)', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://gw2dui.github.io/gw2dui.github.io/?report=abc123"
                webUploadUrl="https://gw2dui.github.io/gw2dui.github.io/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        // The old "Copy Short" button must be gone
        expect(screen.queryByText(/Copy Short/i)).toBeNull();
        // The single Copy button writes the short form
        screen.getByRole('button', { name: /^copy$/i }).click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://gw2dui.github.io/?report=abc123');
    });

    it('Copy button copies full URL when short URL is not available', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        screen.getByRole('button', { name: /^copy$/i }).click();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            'https://darkharasho.github.io/fight-reports/?report=abc123'
        );
    });

    it('shows Building… pill when build status is checking', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="checking"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(screen.getByText(/Building/i)).toBeInTheDocument();
    });

    it('shows Live pill when build status is built', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(screen.getByText(/Live/i)).toBeInTheDocument();
    });

    it('shows Build failed pill when errored', () => {
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="errored"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        expect(screen.getByText(/Build failed/i)).toBeInTheDocument();
    });

    it('Open button calls openExternal with the display URL', () => {
        const openExternal = vi.fn();
        Object.defineProperty(window, 'electronAPI', { value: { openExternal }, writable: true });
        render(
            <WebUploadBanner
                embedded={false}
                webUploadMessage="Uploaded: https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadUrl="https://darkharasho.github.io/fight-reports/?report=abc123"
                webUploadBuildStatus="built"
                webCopyStatus="idle"
                setWebCopyStatus={() => {}}
            />
        );
        screen.getByRole('button', { name: /open/i }).click();
        expect(openExternal).toHaveBeenCalledWith(
            'https://darkharasho.github.io/fight-reports/?report=abc123'
        );
    });
});
