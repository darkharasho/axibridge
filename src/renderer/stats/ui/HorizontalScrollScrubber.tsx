import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type HorizontalScrollScrubberProps = {
    containerRef: React.RefObject<HTMLElement>;
    className?: string;
};

export const HorizontalScrollScrubber = ({ containerRef, className = '' }: HorizontalScrollScrubberProps) => {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const [thumbWidth, setThumbWidth] = useState(0);
    const [thumbLeft, setThumbLeft] = useState(0);
    const draggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartLeftRef = useRef(0);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let rafId = 0;

        const updateThumb = () => {
            const { scrollWidth, clientWidth, scrollLeft } = container;
            const overflow = scrollWidth > clientWidth;
            const track = trackRef.current;
            const trackWidth = track?.clientWidth || 0;
            if (!trackWidth) {
                rafId = window.requestAnimationFrame(updateThumb);
                return;
            }
            if (!overflow) {
                setThumbWidth(trackWidth);
                setThumbLeft(0);
                return;
            }
            const ratio = clientWidth / scrollWidth;
            const nextWidth = Math.max(20, Math.floor(trackWidth * ratio));
            const maxScroll = scrollWidth - clientWidth;
            const maxThumb = Math.max(0, trackWidth - nextWidth);
            const nextLeft = maxScroll > 0 ? Math.floor((scrollLeft / maxScroll) * maxThumb) : 0;
            setThumbWidth(nextWidth);
            setThumbLeft(nextLeft);
        };

        updateThumb();
        const handleScroll = () => updateThumb();
        const resizeObserver = new ResizeObserver(updateThumb);
        resizeObserver.observe(container);
        const content = container.firstElementChild;
        if (content instanceof HTMLElement) {
            resizeObserver.observe(content);
        }
        if (trackRef.current) {
            resizeObserver.observe(trackRef.current);
        }
        const mutationObserver = new MutationObserver(() => updateThumb());
        mutationObserver.observe(container, { childList: true, subtree: true, attributes: true });
        window.addEventListener('resize', updateThumb);
        container.addEventListener('scroll', handleScroll);

        return () => {
            if (rafId) window.cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener('resize', updateThumb);
            container.removeEventListener('scroll', handleScroll);
        };
    }, [containerRef]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!draggingRef.current) return;
            const track = trackRef.current;
            const container = containerRef.current;
            if (!track || !container) return;
            const trackRect = track.getBoundingClientRect();
            const delta = event.clientX - dragStartXRef.current;
            const maxLeft = Math.max(0, trackRect.width - thumbWidth);
            const nextLeft = Math.min(maxLeft, Math.max(0, dragStartLeftRef.current + delta));
            const maxScroll = container.scrollWidth - container.clientWidth;
            const scrollLeft = maxLeft > 0 ? (nextLeft / maxLeft) * maxScroll : 0;
            container.scrollLeft = scrollLeft;
        };

        const handlePointerUp = () => {
            draggingRef.current = false;
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [containerRef, thumbWidth]);

    const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const track = trackRef.current;
        const container = containerRef.current;
        if (!track || !container) return;
        if (thumbWidth <= 0) return;
        const rect = track.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const maxLeft = Math.max(0, rect.width - thumbWidth);
        const nextLeft = Math.min(maxLeft, Math.max(0, clickX - thumbWidth / 2));
        const maxScroll = container.scrollWidth - container.clientWidth;
        container.scrollLeft = maxLeft > 0 ? (nextLeft / maxLeft) * maxScroll : 0;
    };

    const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (thumbWidth <= 0) return;
        draggingRef.current = true;
        dragStartXRef.current = event.clientX;
        dragStartLeftRef.current = thumbLeft;
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    return (
        <div className={`scroll-scrubber ${className}`}>
            <div ref={trackRef} className="scroll-scrubber__track" onClick={handleTrackClick}>
                <div
                    className="scroll-scrubber__thumb"
                    style={{ width: `${thumbWidth}px`, transform: `translateX(${thumbLeft}px)` }}
                    onPointerDown={handleThumbPointerDown}
                />
            </div>
        </div>
    );
};
