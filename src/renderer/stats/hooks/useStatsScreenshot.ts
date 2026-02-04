import { useState } from 'react';
import { toPng } from 'html-to-image';

export const useStatsScreenshot = (embedded: boolean) => {
    const [sharing, setSharing] = useState(false);

    const withImageFetchProxy = async <T,>(fn: () => Promise<T>) => {
        if (!window.electronAPI?.fetchImageAsDataUrl) {
            return fn();
        }
        const originalFetch = window.fetch.bind(window);
        const originalGlobalFetch = globalThis.fetch?.bind(globalThis);
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
        if (originalGlobalFetch) {
            // @ts-ignore
            globalThis.fetch = proxyFetch;
        }
        try {
            return await fn();
        } finally {
            window.fetch = originalFetch;
            if (originalGlobalFetch) {
                // @ts-ignore
                globalThis.fetch = originalGlobalFetch;
            }
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
        setSharing(true);
        const node = document.getElementById('stats-dashboard-container');
        if (node) {
            try {
                // Wait a moment for UI to settle if anything changed
                await new Promise(r => setTimeout(r, 100));

                const excluded = Array.from(node.querySelectorAll('.stats-share-exclude')) as HTMLElement[];
                node.classList.add('stats-share-mode');
                excluded.forEach((el) => {
                    el.dataset.prevDisplay = el.style.display;
                    el.style.display = 'none';
                });
                let dataUrl: string;
                const restoreAssets = await inlineExternalAssets(node);
                try {
                    const scrollWidth = node.scrollWidth;
                    const scrollHeight = node.scrollHeight;
                    dataUrl = await withImageFetchProxy(() => toPng(node, {
                        backgroundColor: '#0f172a',
                        quality: 0.95,
                        pixelRatio: 2,
                        cacheBust: true,
                        width: scrollWidth,
                        height: scrollHeight,
                        style: {
                            overflow: 'visible',
                            maxHeight: 'none',
                            height: 'auto'
                        }
                    }));
                } finally {
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

                // @ts-ignore
                window.electronAPI.sendStatsScreenshot(buffer);
            } catch (err) {
                console.error("Failed to capture stats:", err);
            }
        }
        setTimeout(() => setSharing(false), 2000);
    };

    return {
        sharing,
        setSharing,
        handleShare
    };
};
