import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebUploadBanner } from '../stats/ui/WebUploadBanner';

const setupClipboard = () => {
    Object.assign(navigator, {
        clipboard: {
            writeText: vi.fn()
        }
    });
};

describe('WebUploadBanner', () => {
    beforeEach(() => {
        setupClipboard();
    });

    it('shows short link copy when repo matches github.io host', () => {
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

        expect(screen.getByText(/Copy Short/i)).toBeInTheDocument();
    });

    it('does not show short link copy when repo path is not github.io root', () => {
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

        expect(screen.queryByText(/Copy Short/i)).toBeNull();
    });
});
