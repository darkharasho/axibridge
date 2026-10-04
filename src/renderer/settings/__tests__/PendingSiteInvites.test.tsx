import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingSiteInvites } from '../PendingSiteInvites';

const target = { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: false, favorites: ['guild/site'] };
beforeEach(() => {
    (window as any).electronAPI = {
        getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [{ id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: true }] })),
        acceptSiteInvite: vi.fn(async () => ({ success: true, target }))
    };
});

describe('PendingSiteInvites', () => {
    it('shows dismissed invites too and hands the joined target up', async () => {
        const onJoined = vi.fn();
        render(<PendingSiteInvites onJoined={onJoined} />);
        expect(await screen.findByText('guild/site')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /Join/ }));
        expect(onJoined).toHaveBeenCalledWith(target);
        expect(await screen.findByText(/You can now publish to guild\/site/i)).toBeInTheDocument();
    });

    it('renders nothing when there are no invites', async () => {
        (window as any).electronAPI.getPendingSiteInvites = vi.fn(async () => ({ success: true, invites: [] }));
        const { container } = render(<PendingSiteInvites onJoined={vi.fn()} />);
        await new Promise((r) => setTimeout(r, 0));
        expect(container).toBeEmptyDOMElement();
    });

    it('keeps the row and shows the error when a join fails', async () => {
        (window as any).electronAPI.acceptSiteInvite = vi.fn(async () => ({ success: false, error: 'Invite expired.' }));
        const onJoined = vi.fn();
        render(<PendingSiteInvites onJoined={onJoined} />);
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/site' }));
        expect(await screen.findByText('Invite expired.')).toBeInTheDocument();
        expect(screen.getByText('guild/site')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Join guild/site' })).toBeEnabled();
        expect(onJoined).not.toHaveBeenCalled();
    });
});
