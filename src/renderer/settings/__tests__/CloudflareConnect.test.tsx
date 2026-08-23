import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CloudflareConnect } from '../CloudflareConnect';

const DISCONNECTED = {
    connected: false, accountId: '', accountName: '', bucketName: '', publicUrl: '', clientConfigured: true,
};
const CONNECTED = {
    connected: true,
    accountId: 'acct-1',
    accountName: 'Personal',
    bucketName: 'axibridge-reports',
    publicUrl: 'https://pub-abc.r2.dev',
    clientConfigured: true,
};

const api = {
    getCloudflareStatus: vi.fn(),
    startCloudflareOAuth: vi.fn(),
    selectCloudflareAccount: vi.fn(),
    cancelCloudflareOAuth: vi.fn(),
    disconnectCloudflare: vi.fn(),
};

// The shared setup defines window.electronAPI as writable but not configurable,
// so it can be reassigned and must be restored rather than deleted.
const originalApi = (window as any).electronAPI;

beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.getCloudflareStatus.mockResolvedValue(DISCONNECTED);
    api.cancelCloudflareOAuth.mockResolvedValue({ success: true });
    (window as any).electronAPI = api;
});

afterEach(() => {
    (window as any).electronAPI = originalApi;
});

describe('CloudflareConnect', () => {
    it('offers the sign-in button when nothing is connected yet', async () => {
        render(<CloudflareConnect />);
        expect(await screen.findByRole('button', { name: /sign in with cloudflare/i })).toBeInTheDocument();
    });

    it('shows nothing at all in a build with no OAuth client, rather than a button that cannot work', async () => {
        api.getCloudflareStatus.mockResolvedValue({ ...DISCONNECTED, clientConfigured: false });
        const { container } = render(<CloudflareConnect />);
        await waitFor(() => expect(api.getCloudflareStatus).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('reports the connected account and bucket once a grant succeeds', async () => {
        const user = userEvent.setup();
        const onChanged = vi.fn();
        api.startCloudflareOAuth.mockResolvedValue({ success: true, status: CONNECTED, adoptedExisting: false });
        render(<CloudflareConnect onChanged={onChanged} />);

        await user.click(await screen.findByRole('button', { name: /sign in with cloudflare/i }));

        expect(await screen.findByText(/connected to cloudflare/i)).toBeInTheDocument();
        expect(screen.getByText('axibridge-reports')).toBeInTheDocument();
        expect(screen.getByText('https://pub-abc.r2.dev')).toBeInTheDocument();
        expect(onChanged).toHaveBeenCalled();
    });

    it('says a bucket was reused rather than implying it created one', async () => {
        const user = userEvent.setup();
        api.startCloudflareOAuth.mockResolvedValue({ success: true, status: CONNECTED, adoptedExisting: true });
        render(<CloudflareConnect />);

        await user.click(await screen.findByRole('button', { name: /sign in with cloudflare/i }));
        expect(await screen.findByText(/already existed.*reused/i)).toBeInTheDocument();
    });

    it('asks which account to use, and provisions only the one clicked', async () => {
        const user = userEvent.setup();
        api.startCloudflareOAuth.mockResolvedValue({
            success: true,
            needsAccountChoice: true,
            accounts: [{ id: 'a', name: 'Personal' }, { id: 'b', name: 'Guild' }],
        });
        api.selectCloudflareAccount.mockResolvedValue({ success: true, status: CONNECTED, adoptedExisting: false });
        render(<CloudflareConnect />);

        await user.click(await screen.findByRole('button', { name: /sign in with cloudflare/i }));
        expect(await screen.findByText(/which cloudflare account/i)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Guild' }));
        expect(api.selectCloudflareAccount).toHaveBeenCalledWith({ accountId: 'b', accountName: 'Guild' });
        expect(await screen.findByText(/connected to cloudflare/i)).toBeInTheDocument();
    });

    it('surfaces the payment-card explanation with a link to the dashboard', async () => {
        const user = userEvent.setup();
        api.startCloudflareOAuth.mockResolvedValue({
            success: false,
            error: 'R2 is not enabled on this Cloudflare account yet. Cloudflare requires a payment card on file.',
            helpUrl: 'https://dash.cloudflare.com/?to=/:account/r2',
        });
        render(<CloudflareConnect />);

        await user.click(await screen.findByRole('button', { name: /sign in with cloudflare/i }));

        expect(await screen.findByText(/payment card on file/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /cloudflare dashboard/i }))
            .toHaveAttribute('href', 'https://dash.cloudflare.com/?to=/:account/r2');
        // Still offering the button, because retrying is the right next step.
        expect(screen.getByRole('button', { name: /sign in with cloudflare/i })).toBeEnabled();
    });

    it('treats a cancelled sign-in as a decision, not an error to report', async () => {
        const user = userEvent.setup();
        api.startCloudflareOAuth.mockResolvedValue({ success: false, error: 'Sign-in cancelled.', cancelled: true });
        render(<CloudflareConnect />);

        await user.click(await screen.findByRole('button', { name: /sign in with cloudflare/i }));

        await waitFor(() => expect(screen.getByRole('button', { name: /sign in with cloudflare/i })).toBeEnabled());
        expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument();
    });

    it('disconnects and says the published reports are unaffected', async () => {
        const user = userEvent.setup();
        const onChanged = vi.fn();
        api.getCloudflareStatus.mockResolvedValue(CONNECTED);
        api.disconnectCloudflare.mockResolvedValue({ success: true, status: DISCONNECTED });
        render(<CloudflareConnect onChanged={onChanged} />);

        const disconnect = await screen.findByRole('button', { name: /disconnect/i });
        expect(screen.getByText(/stay exactly as they are/i)).toBeInTheDocument();

        api.getCloudflareStatus.mockResolvedValue(DISCONNECTED);
        await user.click(disconnect);

        expect(await screen.findByRole('button', { name: /sign in with cloudflare/i })).toBeInTheDocument();
        expect(onChanged).toHaveBeenCalled();
    });

    it('releases the loopback listener when the user leaves settings mid-sign-in', async () => {
        const { unmount } = render(<CloudflareConnect />);
        await screen.findByRole('button', { name: /sign in with cloudflare/i });
        unmount();
        expect(api.cancelCloudflareOAuth).toHaveBeenCalled();
    });
});
