import { useCallback, useEffect, useRef, useState, type CSSProperties, type UIEvent } from 'react';

interface UseAppNavigationOptions {
    walkthroughSeen: boolean | null;
    shouldOpenWhatsNew: boolean;
    whatsNewVersion: string;
    logsCount: number;
}

export function useAppNavigation({
    walkthroughSeen,
    shouldOpenWhatsNew,
    whatsNewVersion,
    logsCount,
}: UseAppNavigationOptions) {
    const [view, setView] = useState<'dashboard' | 'stats' | 'history' | 'settings'>('dashboard');
    const viewRef = useRef(view);

    const [whatsNewOpen, setWhatsNewOpen] = useState(false);
    const [walkthroughOpen, setWalkthroughOpen] = useState(false);
    const [helpUpdatesFocusTrigger, setHelpUpdatesFocusTrigger] = useState(0);

    const [webhookModalOpen, setWebhookModalOpen] = useState(false);
    const [webhookDropdownOpen, setWebhookDropdownOpen] = useState(false);
    const webhookDropdownRef = useRef<HTMLDivElement | null>(null);
    const webhookDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
    const webhookDropdownPortalRef = useRef<HTMLDivElement | null>(null);
    const [webhookDropdownStyle, setWebhookDropdownStyle] = useState<CSSProperties | null>(null);

    const logsListRef = useRef<HTMLDivElement | null>(null);
    const [logsViewportHeight, setLogsViewportHeight] = useState(0);
    const [logsScrollTop, setLogsScrollTop] = useState(0);
    const logsScrollRafRef = useRef<number | null>(null);
    const logsScrollTopRef = useRef(0);

    // Keep viewRef in sync
    useEffect(() => {
        viewRef.current = view;
    }, [view]);

    // Open walkthrough on first launch
    useEffect(() => {
        if (walkthroughSeen === false) {
            setWalkthroughOpen(true);
        }
    }, [walkthroughSeen]);

    // Open what's new when there's a new version
    useEffect(() => {
        if (shouldOpenWhatsNew) {
            setWhatsNewOpen(true);
        }
    }, [shouldOpenWhatsNew]);

    // Webhook dropdown positioning and outside-click handling
    useEffect(() => {
        if (!webhookDropdownOpen) return;
        const updatePosition = () => {
            if (!webhookDropdownButtonRef.current) return;
            const rect = webhookDropdownButtonRef.current.getBoundingClientRect();
            setWebhookDropdownStyle({
                position: 'fixed',
                top: Math.round(rect.bottom + 8),
                left: Math.round(rect.left),
                width: Math.round(rect.width),
                zIndex: 9999
            });
        };
        updatePosition();
        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target as Node;
            const inAnchor = webhookDropdownRef.current?.contains(target);
            const inPortal = webhookDropdownPortalRef.current?.contains(target);
            if (!inAnchor && !inPortal) {
                setWebhookDropdownOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setWebhookDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [webhookDropdownOpen]);

    // Viewport size tracking for log list virtualization
    useEffect(() => {
        const node = logsListRef.current;
        if (!node) return;
        const updateViewport = () => {
            setLogsViewportHeight(node.clientHeight);
            setLogsScrollTop(node.scrollTop);
            logsScrollTopRef.current = node.scrollTop;
        };
        updateViewport();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateViewport);
            return () => {
                window.removeEventListener('resize', updateViewport);
            };
        }
        const observer = new ResizeObserver(() => updateViewport());
        observer.observe(node);
        return () => observer.disconnect();
    }, [view, logsCount]);

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (logsScrollRafRef.current !== null) {
                window.cancelAnimationFrame(logsScrollRafRef.current);
                logsScrollRafRef.current = null;
            }
        };
    }, []);

    const handleLogsListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        logsScrollTopRef.current = event.currentTarget.scrollTop;
        if (logsScrollRafRef.current !== null) return;
        logsScrollRafRef.current = window.requestAnimationFrame(() => {
            logsScrollRafRef.current = null;
            setLogsScrollTop(logsScrollTopRef.current);
        });
    }, []);

    const handleWhatsNewClose = useCallback(async () => {
        setWhatsNewOpen(false);
        if (whatsNewVersion) {
            await window.electronAPI.setLastSeenVersion(whatsNewVersion);
        }
    }, [whatsNewVersion]);

    const handleWalkthroughClose = useCallback(() => {
        setWalkthroughOpen(false);
        window.electronAPI?.saveSettings?.({ walkthroughSeen: true });
    }, []);

    const handleWalkthroughLearnMore = useCallback(() => {
        setWalkthroughOpen(false);
        window.electronAPI?.saveSettings?.({ walkthroughSeen: true });
        setView('settings');
        setHelpUpdatesFocusTrigger((current) => current + 1);
    }, []);

    const handleHelpUpdatesFocusConsumed = useCallback((trigger: number) => {
        setHelpUpdatesFocusTrigger((current) => (current === trigger ? 0 : current));
    }, []);

    return {
        view, setView,
        viewRef,
        whatsNewOpen, setWhatsNewOpen,
        walkthroughOpen, setWalkthroughOpen,
        helpUpdatesFocusTrigger,
        webhookModalOpen, setWebhookModalOpen,
        webhookDropdownOpen, setWebhookDropdownOpen,
        webhookDropdownStyle,
        webhookDropdownRef,
        webhookDropdownButtonRef,
        webhookDropdownPortalRef,
        logsListRef,
        logsViewportHeight,
        logsScrollTop,
        handleLogsListScroll,
        handleWhatsNewClose,
        handleWalkthroughClose,
        handleWalkthroughLearnMore,
        handleHelpUpdatesFocusConsumed,
    };
}
