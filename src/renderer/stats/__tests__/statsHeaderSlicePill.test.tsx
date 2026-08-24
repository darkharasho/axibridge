import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsHeader } from '../ui/StatsHeader';
import { FightSlicePill } from '../components/FightSliceTray';
import { useStatsStore, type FightRosterEntry } from '../statsStore';

const ROSTER: FightRosterEntry[] = [
    { id: 'a', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41', isWin: true, enemyClassCounts: {} },
    { id: 'b', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20', isWin: false, enemyClassCounts: {} },
];

beforeEach(() => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().mergeFightRoster(ROSTER, ['a', 'b']);
});

const headerProps = {
    totalLogs: 2,
    devMockAvailable: false,
    devMockUploadState: { uploading: false },
    onDevMockUpload: () => {},
    uploadingWeb: false,
    onWebUpload: () => {},
    onToggleSliceTray: () => {}
};

const pill = () => screen.getByRole('button', { name: /slice/i });

describe('slice pill prominence', () => {
    // On a published report the pill is alone in the header, and under the glass
    // palette --bg-card is rgba(255,255,255,0.035) — the unpromoted pill has no
    // fill there at all, just a hairline. Hence the accent treatment + glyph.
    it('promotes the pill in the embedded header', () => {
        render(<StatsHeader {...headerProps} embedded />);
        expect(pill().querySelector('svg')).not.toBeNull();
    });

    // Desktop keeps the quiet pill: it sits between Search and Upload to Web,
    // where an accent-filled pill would compete with the publish button.
    it('leaves the pill unpromoted in the desktop header', () => {
        render(<StatsHeader {...headerProps} embedded={false} />);
        expect(pill().querySelector('svg')).toBeNull();
    });

    // Prominence must not swallow the active state — that label is the only
    // thing telling the user a slice is currently applied.
    it('still shows the fight count when a promoted pill is active', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        render(<FightSlicePill onClick={() => {}} prominent />);
        expect(pill()).toHaveTextContent(/1 of 2 fights/i);
    });
});
