import React, { useEffect, useState } from 'react';
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

    useEffect(() => {
        if (!enabled) return;
        document.body.appendChild(host);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (host.parentNode) host.parentNode.removeChild(host);
        };
    }, [enabled, host, onExit]);

    if (!enabled) return <>{children}</>;
    return createPortal(children, host);
};

export default FullscreenPortal;
