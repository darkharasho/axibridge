import { useState } from 'react';
import { toPng } from 'html-to-image';

export const useStatsScreenshot = (embedded: boolean) => {
    const [sharing, setSharing] = useState(false);

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
                excluded.forEach((el) => {
                    el.dataset.prevDisplay = el.style.display;
                    el.style.display = 'none';
                });
                const scrollWidth = node.scrollWidth;
                const scrollHeight = node.scrollHeight;
                const dataUrl = await toPng(node, {
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
                });
                excluded.forEach((el) => {
                    el.style.display = el.dataset.prevDisplay || '';
                    delete el.dataset.prevDisplay;
                });

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
