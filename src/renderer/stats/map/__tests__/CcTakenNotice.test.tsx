import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { CcTakenNotice } from '../CcTakenNotice';
import { useStatsStore } from '../../statsStore';
import type { CcTakenEvent } from '../replayTypes';

const reset = () => useStatsStore.setState((useStatsStore as any).getInitialState());

describe('CcTakenNotice', () => {
    beforeEach(reset);

    it('says so when the layer is on but this fight never recorded the lane', () => {
        // The failure this exists for: the toggle is on, the map draws
        // nothing, and nothing on screen says whether that means "no CC
        // landed" or "this log was parsed without the lane".
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const { container } = render(<CcTakenNotice ccTakenEvents={null} />);
        expect(container.textContent).toMatch(/not recorded/i);
    });

    it('says so when the fight payload predates the lane entirely', () => {
        // A payload built before `ccTakenEvents` existed — an older
        // report.json, or a fight cached by a build from before this branch —
        // carries `undefined`, not `null`. Both mean "no lane here", and both
        // must say so: `undefined` slips past a strict `!== null` check and
        // reproduces the exact silent-empty-map failure this component exists
        // to end.
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const { container } = render(<CcTakenNotice ccTakenEvents={undefined} />);
        expect(container.textContent).toMatch(/not recorded/i);
    });

    it('stays quiet when the lane was recorded and simply had nothing in it', () => {
        // An empty array is a real answer — the fight took no CC. Warning
        // here would cry wolf on every quiet fight.
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const { container } = render(<CcTakenNotice ccTakenEvents={[]} />);
        expect(container.textContent).toBe('');
    });

    it('stays quiet while the layer is off', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        const events: CcTakenEvent[] = [];
        const { container } = render(<CcTakenNotice ccTakenEvents={events} />);
        expect(container.textContent).toBe('');
    });

    it('stays quiet with the layer off even when the lane is missing', () => {
        // Nobody asked for these marks, so a missing lane is not news.
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        const { container } = render(<CcTakenNotice ccTakenEvents={null} />);
        expect(container.textContent).toBe('');
    });
});
