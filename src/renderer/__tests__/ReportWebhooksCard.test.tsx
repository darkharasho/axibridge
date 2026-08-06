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

    it('hides the tag ids field for regular channels', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={() => {}} />);
        expect(screen.queryByPlaceholderText(/forum tag ids/i)).toBeNull();
    });

    it('shows the tag ids field for forum channels and commits on blur', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry({ isForum: true })]} onChange={onChange} />);
        const input = screen.getByPlaceholderText(/forum tag ids/i);
        fireEvent.change(input, { target: { value: '111111111111111111' } });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'w1', forumTagIds: '111111111111111111' }),
        ]);
    });

    it('shows the parsed tag count', () => {
        render(<ReportWebhooksCard
            reportWebhooks={[entry({ isForum: true, forumTagIds: '111111111111111111 222222222222222222' })]}
            onChange={() => {}}
        />);
        expect(screen.getByText(/2 tags will be applied/i)).toBeTruthy();
    });

    it('warns when the text parses to no ids', () => {
        render(<ReportWebhooksCard
            reportWebhooks={[entry({ isForum: true, forumTagIds: 'raid-night' })]}
            onChange={() => {}}
        />);
        expect(screen.getByText(/no tag ids recognized/i)).toBeTruthy();
    });

    it('notes the 5-tag limit when more than 5 parse', () => {
        const six = ['111111111111111111', '222222222222222222', '333333333333333333',
            '444444444444444444', '555555555555555555', '666666666666666666'].join(', ');
        render(<ReportWebhooksCard
            reportWebhooks={[entry({ isForum: true, forumTagIds: six })]}
            onChange={() => {}}
        />);
        expect(screen.getByText(/first 5 are used/i)).toBeTruthy();
    });

    it('mentions how to copy tag ids', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ isForum: true })]} onChange={() => {}} />);
        expect(screen.getByText(/copy tag id/i)).toBeTruthy();
    });

    it('tolerates legacy hooks without the field', () => {
        const legacy = entry({ isForum: true });
        delete (legacy as any).forumTagIds;
        render(<ReportWebhooksCard reportWebhooks={[legacy]} onChange={() => {}} />);
        const input = screen.getByPlaceholderText(/forum tag ids/i) as HTMLInputElement;
        expect(input.value).toBe('');
    });
});
