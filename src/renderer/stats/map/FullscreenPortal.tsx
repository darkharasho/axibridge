import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface FullscreenPortalProps {
    enabled: boolean;
    onExit: () => void;
    children: React.ReactNode;
}

export const FullscreenPortal: React.FC<FullscreenPortalProps> = ({ enabled, onExit, children }) => {
    const [host] = useState<HTMLElement>(() => {
        const el = document.createElement('div');
        el.className = 'replay-fullscreen-host';
        el.style.position = 'fixed';
        el.style.inset = '0';
        el.style.zIndex = '9999';
        el.style.background = 'rgba(4, 8, 18, 0.98)';
        return el;
    });

    // Held in a ref, not a dependency. Callers pass an inline arrow, so a
    // dependency on `onExit` re-ran this effect on EVERY render of the parent:
    // the cleanup detached `host` from the document and the effect re-appended
    // it. React keeps the portal's own nodes, so nothing "remounts" — but a
    // detached-and-reinserted subtree restarts every CSS entrance animation
    // (`.app-dropdown` fades 0 -> 1) and relayouts. During a map pan, which
    // writes the viewport on every mousemove, that strobed the whole HUD.
    const exitRef = useRef(onExit);
    exitRef.current = onExit;

    useEffect(() => {
        if (!enabled) return;
        document.body.appendChild(host);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitRef.current(); };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (host.parentNode) host.parentNode.removeChild(host);
        };
    }, [enabled, host]);

    if (!enabled) return <>{children}</>;
    return createPortal(children, host);
};

export default FullscreenPortal;
