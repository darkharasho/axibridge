import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportWebhooksCard } from '../ReportWebhooksCard';
import { DEFAULT_REPORT_TITLE_TEMPLATE, makeDefaultReportWebhook } from '../../shared/reportWebhooks';

const entry = (over = {}) => ({
    ...makeDefaultReportWebhook('w1'),
    name: 'Guild Forum',
    url: 'https://discord.com/api/webhooks/1/abc',
    ...over,
});

describe('ReportWebhooksCard', () => {
    it('renders an empty state with an add button', () => {
        render(<ReportWebhooksCard reportWebhooks={[]} onChange={() => {}} />);
        expect(screen.getByText(/add webhook/i)).toBeTruthy();
    });

    it('adds a default entry', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[]} onChange={onChange} />);
        fireEvent.click(screen.getByText(/add webhook/i));
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0];
        expect(next).toHaveLength(1);
        expect(next[0]).toMatchObject({ enabled: true, isForum: false, titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE });
    });

    it('toggles enabled and forum flags immediately', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={onChange} />);
        fireEvent.click(screen.getByLabelText(/enabled/i));
        expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'w1', enabled: false })]);
        fireEvent.click(screen.getByLabelText(/forum channel/i));
        expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'w1', isForum: true })]);
    });

    it('commits text edits on blur', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={onChange} />);
        const nameInput = screen.getByDisplayValue('Guild Forum');
        fireEvent.change(nameInput, { target: { value: 'EWW Reports' } });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.blur(nameInput);
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'w1', name: 'EWW Reports' })]);
    });

    it('shows a live preview of the title template', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ titleTemplate: '{commander} night' })]} onChange={() => {}} />);
        expect(screen.getByText(/Axi Vale night/)).toBeTruthy();
    });

    it('warns on non-discord URLs', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ url: 'https://example.com/hook' })]} onChange={() => {}} />);
        expect(screen.getByText(/doesn't look like a discord webhook/i)).toBeTruthy();
    });

    it('deletes an entry', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={onChange} />);
        fireEvent.click(screen.getByTitle(/remove webhook/i));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('previews account and guild tokens with sample values', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ titleTemplate: '[{guild_tag}] {guild} — {account}' })]} onChange={() => {}} />);
        expect(screen.getByText(/\[AXI\] Axius Imperium — Axi\.1234/)).toBeTruthy();
    });

    it('lists the new placeholders in the hint', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={() => {}} />);
        const hint = screen.getByText(/placeholders:/i);
        expect(hint.textContent).toContain('{account}');
        expect(hint.textContent).toContain('{guild}');
        expect(hint.textContent).toContain('{guild_tag}');
    });
});
