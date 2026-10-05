import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublishingSiteCard } from '../PublishingSiteCard';

const details = (over = {}) => ({ role: 'admin' as const, ownerType: 'Organization' as const, ownerAvatarUrl: 'a.png', pagesUrl: 'https://reports.example/', memberCount: 3, ...over });

describe('PublishingSiteCard', () => {
    it('shows an org site with the admin role and real Pages URL', () => {
        render(<PublishingSiteCard owner="guild" repo="site" details={details()} inviteCount={0} onOpenPanel={vi.fn()} />);
        expect(screen.getByText('guild/site')).toBeInTheDocument();
        expect(screen.getByText('org · guild')).toBeInTheDocument();
        expect(screen.getByText('you: admin')).toBeInTheDocument();
        expect(screen.getByText('https://reports.example/')).toBeInTheDocument();
    });
    it('shows a personal site with the publisher role', () => {
        render(<PublishingSiteCard owner="me" repo="site" details={details({ role: 'publisher', ownerType: 'User' })} inviteCount={0} onOpenPanel={vi.fn()} />);
        expect(screen.getByText('personal')).toBeInTheDocument();
        expect(screen.getByText('you: publisher')).toBeInTheDocument();
    });
    it('falls back to the inferred URL and no badges while details are unknown', () => {
        render(<PublishingSiteCard owner="guild" repo="site" details={null} inviteCount={0} onOpenPanel={vi.fn()} />);
        expect(screen.getByText('https://guild.github.io/site')).toBeInTheDocument();
        expect(screen.queryByText(/you:/)).toBeNull();
    });
    it('opens the site list from Switch site and shows the invite count', () => {
        const onOpenPanel = vi.fn();
        render(<PublishingSiteCard owner="guild" repo="site" details={details()} inviteCount={2} onOpenPanel={onOpenPanel} />);
        fireEvent.click(screen.getByRole('button', { name: /Switch site/ }));
        expect(onOpenPanel).toHaveBeenCalledWith('list');
        expect(screen.getByRole('button', { name: /Switch site/ })).toHaveTextContent('2');
    });
    it('offers create / use existing / find when there is no site', () => {
        const onOpenPanel = vi.fn();
        render(<PublishingSiteCard owner={null} repo={null} details={null} inviteCount={0} onOpenPanel={onOpenPanel} />);
        fireEvent.click(screen.getByRole('button', { name: 'Create new site' }));
        fireEvent.click(screen.getByRole('button', { name: 'Use existing repo…' }));
        fireEvent.click(screen.getByRole('button', { name: 'Find my sites' }));
        expect(onOpenPanel.mock.calls.map((c) => c[0])).toEqual(['create', 'existing', 'find']);
    });
    it('renders children (Members) under the site', () => {
        render(<PublishingSiteCard owner="guild" repo="site" details={null} inviteCount={0} onOpenPanel={vi.fn()}><div>members here</div></PublishingSiteCard>);
        expect(screen.getByText('members here')).toBeInTheDocument();
    });
});
