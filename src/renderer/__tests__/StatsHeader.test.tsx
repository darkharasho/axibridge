import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatsHeader } from '../stats/ui/StatsHeader';

describe('StatsHeader', () => {
    it('renders dashboard title and log count', () => {
        render(
            <StatsHeader
                embedded
                dashboardTitle="Statistics Dashboard - Overview"
                totalLogs={4}
                onBack={() => {}}
                devMockAvailable={false}
                devMockUploadState={{ uploading: false }}
                onDevMockUpload={() => {}}
                uploadingWeb={false}
                onWebUpload={() => {}}
                sharing={false}
                onShare={() => {}}
            />
        );

        expect(screen.getByText('Statistics Dashboard - Overview')).toBeInTheDocument();
        expect(screen.getByText(/Performance across 4 uploaded logs/i)).toBeInTheDocument();
    });
});
