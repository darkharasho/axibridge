import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommanderInsights } from '../CommanderInsights';
import type { DetectorFinding } from '../detectors/types';

const fGood = (id: string, severity = 0.5): DetectorFinding => ({
  id, side: 'good', severity,
  headline: `good ${id}`, evidence: 'e', threshold: 't',
  vizKind: 'threshold-bar', vizData: { value: 1, max: 2, severity: 'green' },
});
const fBad = (id: string, severity = 0.5): DetectorFinding => ({ ...fGood(id, severity), side: 'bad' });

describe('CommanderInsights', () => {
  it('renders up to 4 findings per side, sorted by severity', () => {
    render(<CommanderInsights findings={[fGood('a', 0.1), fGood('b', 0.9), fBad('c', 0.7), fBad('d', 0.2)]} />);
    expect(screen.getByText('good b')).toBeInTheDocument();
    expect(screen.getByText('good a')).toBeInTheDocument();
    expect(screen.getByText('What went right')).toBeInTheDocument();
    expect(screen.getByText("Could've gone better")).toBeInTheDocument();
  });

  it('shows an empty-state line when one side has no findings', () => {
    render(<CommanderInsights findings={[fBad('only', 0.5)]} />);
    expect(screen.getByText(/nothing notable yet/i)).toBeInTheDocument();
  });
});
