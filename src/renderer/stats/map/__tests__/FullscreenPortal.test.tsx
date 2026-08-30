import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { FullscreenPortal } from '../FullscreenPortal';

/**
 * The host div is appended to <body> by an effect. If that effect re-runs, the
 * cleanup detaches the host and the effect re-attaches it — which restarts every
 * CSS entrance animation in the subtree (`.app-dropdown` fades 0 -> 1) and forces
 * a full relayout. On a map pan that fires on every mousemove, so the whole HUD
 * strobes. The effect must therefore depend only on `enabled`, never on caller
 * identity like `onExit`.
 */
describe('FullscreenPortal host stability', () => {
    const Harness: React.FC<{ onRender?: () => void }> = () => {
        const [n, setN] = useState(0);
        return (
            // Deliberately an inline arrow, as a real caller writes it.
            <FullscreenPortal enabled onExit={() => setN(0)}>
                <button onClick={() => setN(v => v + 1)}>bump {n}</button>
            </FullscreenPortal>
        );
    };

    it('never detaches its host while re-rendering', () => {
        const removeSpy = vi.spyOn(Node.prototype, 'removeChild');
        render(<Harness />);
        const host = document.querySelector('.replay-fullscreen-host') as HTMLElement;
        expect(host.parentNode).toBe(document.body);
        removeSpy.mockClear();

        for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button'));

        const detaches = removeSpy.mock.calls.filter(c => c[0] === host).length;
        removeSpy.mockRestore();
        expect(detaches, 'host was detached from the document mid-render').toBe(0);
        expect(document.querySelector('.replay-fullscreen-host')).toBe(host);
    });

    it('keeps the rendered child node identity across re-renders', () => {
        render(<Harness />);
        const before = screen.getByRole('button');
        fireEvent.click(before);
        expect(screen.getByRole('button')).toBe(before);
    });

    it('still removes the host on unmount', () => {
        const view = render(<Harness />);
        expect(document.querySelector('.replay-fullscreen-host')).toBeTruthy();
        view.unmount();
        expect(document.querySelector('.replay-fullscreen-host')).toBeNull();
    });

    it('still exits on Escape after several re-renders', () => {
        const onExit = vi.fn();
        const Esc: React.FC = () => {
            const [n, setN] = useState(0);
            return (
                <FullscreenPortal enabled onExit={() => onExit(n)}>
                    <button onClick={() => setN(v => v + 1)}>bump {n}</button>
                </FullscreenPortal>
            );
        };
        render(<Esc />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.click(screen.getByRole('button'));
        fireEvent.keyDown(window, { key: 'Escape' });
        // Must call the LATEST onExit, not the one captured at mount.
        expect(onExit).toHaveBeenCalledWith(2);
    });
});
