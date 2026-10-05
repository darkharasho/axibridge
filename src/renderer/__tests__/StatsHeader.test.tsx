import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StatsHeader } from '../stats/ui/StatsHeader';

describe('StatsHeader', () => {
    it('renders dashboard title and log count', () => {
        render(
            <StatsHeader
                embedded
                dashboardTitle="Statistics Dashboard - Overview"
                totalLogs={4}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
            />
        );

        expect(screen.getByText('Statistics Dashboard - Overview')).toBeInTheDocument();
        expect(screen.getByText(/Performance across 4 uploaded logs/i)).toBeInTheDocument();
    });

    it('renders a search button when onSearchClick is provided and fires it on click', () => {
        const onSearchClick = vi.fn();
        render(
            <StatsHeader
                embedded={false}
                totalLogs={0}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
                onSearchClick={onSearchClick}
            />
        );

        const button = screen.getByRole('button', { name: 'Search' });
        fireEvent.click(button);
        expect(onSearchClick).toHaveBeenCalledTimes(1);
    });

    it('shows the keyboard shortcut on the search trigger', () => {
        render(
            <StatsHeader
                embedded={false}
                totalLogs={0}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
                onSearchClick={() => {}}
            />
        );

        // The hint used to live only in a title attribute, which never shows on
        // a desktop app the user drives from the keyboard.
        expect(screen.getByRole('button', { name: 'Search' }).textContent).toContain('Ctrl K');
    });

    it('omits the search button in embedded mode even when onSearchClick is provided', () => {
        render(
            <StatsHeader
                embedded
                totalLogs={0}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
                onSearchClick={() => {}}
            />
        );

        expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    });

    it('omits the search button when onSearchClick is not provided', () => {
        render(
            <StatsHeader
                embedded={false}
                totalLogs={0}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
            />
        );

        expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    });

    it('disables the publish button and surfaces the slice reason when a slice is active', () => {
        render(
            <StatsHeader
                embedded={false}
                totalLogs={4}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
                publishBlockedReason="Clear the fight slice to publish. Reports always contain every fight."
            />
        );

        const button = screen.getByRole('button', { name: /Upload to Web/i });
        expect(button).toBeDisabled();
        expect(screen.getByTitle('Clear the fight slice to publish. Reports always contain every fight.')).toBeInTheDocument();
    });

    it('leaves the publish button enabled when publishBlockedReason is null', () => {
        render(
            <StatsHeader
                embedded={false}
                totalLogs={4}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
                publishBlockedReason={null}
            />
        );

        const button = screen.getByRole('button', { name: /Upload to Web/i });
        expect(button).not.toBeDisabled();
    });

    it('names the default site on the publish button', () => {
        render(
            <StatsHeader embedded={false} totalLogs={4} devMockAvailable={false} devMockUploadState={{ uploading: false }} onDevMockUpload={() => {}}
                uploadingWeb={false} onWebUpload={() => {}}
                uploadTargets={[{ fullName: 'guild/site', label: 'guild/site (Default)', isDefault: true, pagesUrl: 'https://g/', memberCount: 4 }]} />
        );
        expect(screen.getByRole('button', { name: /Publish to guild\/site/ })).toBeInTheDocument();
    });

    it('shows where an alternate publish goes and uses it once', () => {
        const onWebUploadToTarget = vi.fn();
        render(
            <StatsHeader embedded={false} totalLogs={4} devMockAvailable={false} devMockUploadState={{ uploading: false }} onDevMockUpload={() => {}}
                uploadingWeb={false} onWebUpload={() => {}} onWebUploadToTarget={onWebUploadToTarget}
                uploadTargets={[
                    { fullName: 'guild/site', label: 'guild/site (Default)', isDefault: true, pagesUrl: 'https://g/', memberCount: 4 },
                    { fullName: 'x/y', label: 'x/y', isDefault: false, pagesUrl: 'https://x/', memberCount: null }
                ]} />
        );
        fireEvent.click(screen.getByTitle('Choose upload repository'));
        expect(screen.getByText('Your report appears at https://g/, alongside reports from 3 other commanders.')).toBeInTheDocument();
        expect(screen.getByText('https://x/')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /x\/y/ }));
        expect(onWebUploadToTarget).toHaveBeenCalledWith('x/y');
        expect(screen.getByRole('button', { name: /Publish to guild\/site/ })).toBeInTheDocument();
    });
});
