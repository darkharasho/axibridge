import { useState } from 'react';
import { toPng } from 'html-to-image';

export const useStatsScreenshot = (embedded: boolean) => {
    const [shareStage, setShareStage] = useState<'idle' | 'settling' | 'capturing' | 'sending'>('idle');
    const sharing = shareStage !== 'idle';

    const waitForVisualSettling = async (node: HTMLElement) => {
        const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const readLayoutSignature = () => {
            const rect = node.getBoundingClientRect();
            return [
                Math.round(rect.width),
                Math.round(rect.height),
                node.scrollWidth,
                node.scrollHeight
            ].join(':');
        };

        try {
            await (document as any).fonts?.ready;
        } catch {
            // Ignore font readiness issues and continue with the capture flow.
        }

        await nextPaint();
        await nextPaint();

        const startedAt = performance.now();
        let lastSignature = readLayoutSignature();
        let stableSince = performance.now();

        while (performance.now() - startedAt < 3200) {
            await nextPaint();
            const currentSignature = readLayoutSignature();
            if (currentSignature !== lastSignature) {
                lastSignature = currentSignature;
                stableSince = performance.now();
            }

            const activeAnimations = typeof document.getAnimations === 'function'
                ? document.getAnimations().filter((animation) => animation.playState !== 'finished').length
                : 0;
            const elapsed = performance.now() - startedAt;
            const stableFor = performance.now() - stableSince;
            const hitMinimumDelay = elapsed >= 700;
            const isStable = stableFor >= 350;
            if (hitMinimumDelay && isStable && activeAnimations === 0) {
                break;
            }
        }

        await nextPaint();
        await nextPaint();
    };

    const withImageFetchProxy = async <T,>(fn: () => Promise<T>) => {
        if (!window.electronAPI?.fetchImageAsDataUrl) {
            return fn();
        }
        const originalFetch = window.fetch.bind(window);
        const originalGlobalFetch = globalThis.fetch.bind(globalThis);
        const proxyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;
            if (/^https?:\/\//i.test(url)) {
                const resp = await window.electronAPI.fetchImageAsDataUrl(url);
                if (resp?.success && resp.dataUrl) {
                    return originalFetch(resp.dataUrl);
                }
            }
            return originalFetch(input, init);
        };
        // @ts-ignore
        window.fetch = proxyFetch;
        // @ts-ignore
        globalThis.fetch = proxyFetch;
        try {
            return await fn();
        } finally {
            window.fetch = originalFetch;
            // @ts-ignore
            globalThis.fetch = originalGlobalFetch;
        }
    };

    const inlineExternalAssets = async (node: HTMLElement) => {
        if (!window.electronAPI?.fetchImageAsDataUrl) {
            return () => { };
        }

        const cache = new Map<string, string>();
        const restoreCallbacks: Array<() => void> = [];

        const fetchDataUrl = async (url: string) => {
            if (cache.has(url)) return cache.get(url) || null;
            const resp = await window.electronAPI.fetchImageAsDataUrl(url);
            if (resp?.success && resp.dataUrl) {
                cache.set(url, resp.dataUrl);
                return resp.dataUrl;
            }
            cache.set(url, '');
            return null;
        };

        const images = Array.from(node.querySelectorAll('img')) as HTMLImageElement[];
        await Promise.all(images.map(async (img) => {
            const src = img.currentSrc || img.src;
            if (!src || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('file:')) return;
            const dataUrl = await fetchDataUrl(src);
            if (!dataUrl) return;
            const prevSrc = img.src;
            const prevSrcset = img.srcset;
            img.src = dataUrl;
            img.srcset = '';
            restoreCallbacks.push(() => {
                img.src = prevSrc;
                img.srcset = prevSrcset;
            });
            try {
                await img.decode?.();
            } catch {
                // ignore decode failures
            }
        }));

        const elements = Array.from(node.querySelectorAll('*')) as HTMLElement[];
        await Promise.all(elements.map(async (el) => {
            const computed = window.getComputedStyle(el);
            const backgroundImage = computed.backgroundImage;
            if (!backgroundImage || backgroundImage === 'none' || !backgroundImage.includes('url(')) return;
            const matches = Array.from(backgroundImage.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g));
            if (!matches.length) return;
            let nextBackground = backgroundImage;
            let updated = false;
            for (const match of matches) {
                const url = match[1];
                if (!url) continue;
                const dataUrl = await fetchDataUrl(url);
                if (!dataUrl) continue;
                nextBackground = nextBackground.replace(match[0], `url("${dataUrl}")`);
                updated = true;
            }
            if (!updated) return;
            const prevInline = el.style.backgroundImage;
            el.style.backgroundImage = nextBackground;
            restoreCallbacks.push(() => {
                el.style.backgroundImage = prevInline;
            });
        }));

        return () => {
            restoreCallbacks.forEach((restore) => restore());
        };
    };

    const handleShare = async () => {
        // @ts-ignore
        if (embedded || !window.electronAPI?.sendStatsScreenshot) return;
        setShareStage('settling');
        const node = document.getElementById('stats-dashboard-container');
        if (node) {
            try {
                await waitForVisualSettling(node);

                const excluded = Array.from(node.querySelectorAll('.stats-share-exclude')) as HTMLElement[];
                node.classList.add('stats-share-mode');
                excluded.forEach((el) => {
                    el.dataset.prevDisplay = el.style.display;
                    el.style.display = 'none';
                });
                let dataUrl: string;
                const restoreAssets = await inlineExternalAssets(node);
                let captureNode: HTMLElement | null = null;
                let captureHost: HTMLDivElement | null = null;
                try {
                    setShareStage('capturing');
                    captureNode = node.cloneNode(true) as HTMLElement;
                    captureHost = document.createElement('div');
                    captureHost.setAttribute('aria-hidden', 'true');
                    captureHost.style.position = 'fixed';
                    captureHost.style.left = '-100000px';
                    captureHost.style.top = '0';
                    captureHost.style.pointerEvents = 'none';
                    captureHost.style.opacity = '0';
                    captureHost.style.zIndex = '-1';
                    captureHost.style.background = '#10141b';
                    captureNode.id = 'stats-dashboard-capture-clone';
                    captureNode.style.width = `${node.clientWidth}px`;
                    captureNode.style.maxWidth = `${node.clientWidth}px`;
                    captureNode.style.height = 'auto';
                    captureNode.style.maxHeight = 'none';
                    captureNode.style.minHeight = '0';
                    captureNode.style.overflow = 'visible';
                    captureNode.style.overflowY = 'visible';
                    captureNode.style.paddingRight = '0';

                    const scrollableNodes = [captureNode, ...Array.from(captureNode.querySelectorAll('*')) as HTMLElement[]];
                    scrollableNodes.forEach((el) => {
                        const computed = window.getComputedStyle(el);
                        const overflowY = computed.overflowY;
                        const overflowX = computed.overflowX;
                        const isVerticallyScrollable = overflowY === 'auto' || overflowY === 'scroll';
                        const isHorizontallyScrollable = overflowX === 'auto' || overflowX === 'scroll';
                        if (isVerticallyScrollable) {
                            el.style.overflowY = 'visible';
                            el.style.maxHeight = 'none';
                            if (el !== captureNode) {
                                el.style.height = 'auto';
                                el.style.minHeight = '0';
                            }
                            el.style.paddingRight = '0';
                            // Hide scrollbar chrome in case any browser keeps a gutter reserved.
                            (el.style as any).scrollbarWidth = 'none';
                            (el.style as any).msOverflowStyle = 'none';
                        }
                        if (isHorizontallyScrollable) {
                            el.style.overflowX = 'visible';
                        }
                    });

                    captureHost.appendChild(captureNode);
                    document.body.appendChild(captureHost);
                    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

                    const renderNode = captureNode;

                    const captureWidth = Math.max(
                        renderNode.scrollWidth,
                        renderNode.getBoundingClientRect().width,
                        node.clientWidth
                    );
                    const captureHeight = Math.max(
                        renderNode.scrollHeight,
                        renderNode.getBoundingClientRect().height,
                        node.scrollHeight
                    );

                    dataUrl = await withImageFetchProxy(() => toPng(renderNode, {
                        backgroundColor: '#10141b',
                        quality: 0.95,
                        pixelRatio: 2,
                        cacheBust: true,
                        width: captureWidth,
                        height: captureHeight,
                        style: {
                            overflow: 'visible',
                            maxHeight: 'none',
                            height: 'auto',
                            paddingRight: '0'
                        }
                    }));
                } finally {
                    captureHost?.remove();
                    restoreAssets();
                    node.classList.remove('stats-share-mode');
                    excluded.forEach((el) => {
                        el.style.display = el.dataset.prevDisplay || '';
                        delete el.dataset.prevDisplay;
                    });
                }

                const resp = await fetch(dataUrl);
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const buffer = new Uint8Array(arrayBuffer);

                setShareStage('sending');
                // @ts-ignore
                window.electronAPI.sendStatsScreenshot(buffer);
            } catch (err) {
                console.error("Failed to capture stats:", err);
                setShareStage('idle');
            }
        } else {
            setShareStage('idle');
        }
        setTimeout(() => setShareStage('idle'), 1500);
    };

    return {
        sharing,
        shareStage,
        handleShare
    };
};
