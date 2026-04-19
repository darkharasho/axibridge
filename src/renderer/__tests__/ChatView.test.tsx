import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatView } from '../ChatView';

const mockElectronAPI = {
    getOllamaStatus: vi.fn().mockResolvedValue({ connected: false, models: [], activeModel: null }),
    onOllamaStatusChanged: vi.fn().mockReturnValue(() => {}),
    onOllamaChatToken: vi.fn().mockReturnValue(() => {}),
    ollamaChat: vi.fn().mockResolvedValue(undefined),
    getOllamaSettings: vi.fn().mockResolvedValue({ enabled: true, activeModel: 'llama3.1:8b' }),
};

beforeEach(() => {
    vi.clearAllMocks();
    (window as any).electronAPI = mockElectronAPI;
});

describe('ChatView', () => {
    it('shows empty state with suggestion pills when no messages', () => {
        render(<ChatView logs={[]} compact={false} ollamaEnabled={true} onNavigateToChat={() => {}} ollamaConnected={true} />);
        expect(screen.getByText(/ask anything/i)).toBeInTheDocument();
        expect(screen.getByText(/summarize tonight/i)).toBeInTheDocument();
    });

    it('hides pills once a message is sent', async () => {
        render(<ChatView logs={[]} compact={false} ollamaEnabled={true} onNavigateToChat={() => {}} ollamaConnected={true} />);
        const input = screen.getByPlaceholderText(/ask about your fights/i);
        fireEvent.change(input, { target: { value: 'Who topped damage?' } });
        fireEvent.submit(input.closest('form')!);
        expect(screen.queryByText(/summarize tonight/i)).not.toBeInTheDocument();
    });

    it('shows Ollama-not-connected state when disconnected', () => {
        render(<ChatView logs={[]} compact={false} ollamaEnabled={true} onNavigateToChat={() => {}} ollamaConnected={false} />);
        expect(screen.getByText(/ollama isn't connected/i)).toBeInTheDocument();
    });

    it('renders in compact mode without full status bar', () => {
        const { container } = render(
            <ChatView logs={[]} compact={true} ollamaEnabled={true} onNavigateToChat={() => {}} onClose={() => {}} />
        );
        expect(container.querySelector('[data-compact-header]')).toBeInTheDocument();
    });

    it('calls onNavigateToChat when expand button is clicked in compact mode', () => {
        const onNav = vi.fn();
        render(<ChatView logs={[]} compact={true} ollamaEnabled={true} onNavigateToChat={onNav} onClose={() => {}} />);
        fireEvent.click(screen.getByTitle(/expand/i));
        expect(onNav).toHaveBeenCalled();
    });
});
