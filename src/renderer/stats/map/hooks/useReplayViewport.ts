import { useCallback } from 'react';
import { useStatsStore } from '../../statsStore';

interface UseReplayViewportArgs {
    mapWidth: number;
    mapHeight: number;
    containerWidth: number;
    containerHeight: number;
}

const ZOOM_STEP = 0.15;
const MIN_SCALE = 1;
const MAX_SCALE = 50;

export function useReplayViewport({ mapWidth, mapHeight, containerWidth, containerHeight }: UseReplayViewportArgs) {
    const replayViewport = useStatsStore(state => state.replayViewport);
    const setReplayViewport = useStatsStore(state => state.setReplayViewport);
    const resetReplayViewport = useStatsStore(state => state.resetReplayViewport);

    const zoomIn = useCallback(() => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({ scale: Math.min(prev.scale * (1 + ZOOM_STEP * 2), MAX_SCALE) });
    }, [setReplayViewport]);

    const zoomOut = useCallback(() => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({ scale: Math.max(prev.scale * (1 - ZOOM_STEP * 2), MIN_SCALE) });
    }, [setReplayViewport]);

    const panBy = useCallback((dx: number, dy: number) => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({ tx: prev.tx + dx, ty: prev.ty + dy });
    }, [setReplayViewport]);

    const resetViewport = useCallback(() => { resetReplayViewport(); }, [resetReplayViewport]);

    const centerOn = useCallback((x: number, y: number) => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({
            tx: containerWidth / 2 - x * prev.scale,
            ty: containerHeight / 2 - y * prev.scale,
        });
    }, [containerWidth, containerHeight, setReplayViewport]);

    /**
     * Compute the rendered SVG coordinate scale factor accounting for
     * preserveAspectRatio="xMidYMid slice" filling.
     * With "slice", the SVG scales uniformly to fill the container,
     * so 1 SVG unit = (containerSize / mapSize * max_scale) CSS pixels.
     */
    const svgRenderScale = useCallback((rect: DOMRect): number => {
        return Math.max(rect.width / mapWidth, rect.height / mapHeight);
    }, [mapWidth, mapHeight]);

    /** Convert a screen-space cursor position to SVG viewBox coordinates. */
    const screenToSvg = useCallback((clientX: number, clientY: number, rect: DOMRect): [number, number] => {
        const rs = Math.max(rect.width / mapWidth, rect.height / mapHeight);
        const renderedW = mapWidth * rs;
        const renderedH = mapHeight * rs;
        const offsetX = (rect.width - renderedW) / 2;
        const offsetY = (rect.height - renderedH) / 2;
        return [
            (clientX - rect.left - offsetX) / renderedW * mapWidth,
            (clientY - rect.top - offsetY) / renderedH * mapHeight,
        ];
    }, [mapWidth, mapHeight]);

    const attachPanDrag = useCallback((el: Element, onDragChange?: (dragging: boolean) => void): (() => void) => {
        let lastX = 0, lastY = 0;
        let active = false;
        let moved = false;
        const htmlEl = el as HTMLElement;

        const onMouseDown = (e: Event) => {
            const me = e as MouseEvent;
            if (me.button !== 0) return;
            active = true;
            moved = false;
            lastX = me.clientX;
            lastY = me.clientY;
            htmlEl.style.cursor = 'grabbing';
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!active) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            // ignore tiny jitter so a click doesn't become a drag
            if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
            if (!moved) { moved = true; onDragChange?.(true); }
            const rect = el.getBoundingClientRect();
            // Divide by render scale to convert CSS-pixel delta to SVG-unit delta.
            const rs = Math.max(rect.width / mapWidth, rect.height / mapHeight);
            const { replayViewport: prev } = useStatsStore.getState();
            setReplayViewport({
                tx: prev.tx + dx / rs,
                ty: prev.ty + dy / rs,
            });
            lastX = e.clientX;
            lastY = e.clientY;
        };

        const onMouseUp = () => {
            if (!active) return;
            active = false;
            htmlEl.style.cursor = 'crosshair';
            // leave moved=true so the click handler can see it, then clear next frame
            if (moved) {
                requestAnimationFrame(() => { moved = false; onDragChange?.(false); });
            }
        };

        el.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            el.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [mapWidth, mapHeight, setReplayViewport]);

    const attachWheelZoom = useCallback((el: Element): (() => void) => {
        const handler = (e: Event) => {
            const we = e as WheelEvent;
            we.preventDefault();
            const { replayViewport: prev } = useStatsStore.getState();
            const rect = el.getBoundingClientRect();
            const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
                prev.scale * (1 - Math.sign(we.deltaY) * ZOOM_STEP)
            ));
            if (next === prev.scale) return;
            const ratio = next / prev.scale;
            // Account for preserveAspectRatio="xMidYMid slice" filling:
            // the SVG content is uniformly scaled to fill the container.
            const rs = Math.max(rect.width / mapWidth, rect.height / mapHeight);
            const renderedW = mapWidth * rs;
            const renderedH = mapHeight * rs;
            const ox = (rect.width - renderedW) / 2;
            const oy = (rect.height - renderedH) / 2;
            const svgX = (we.clientX - rect.left - ox) / renderedW * mapWidth;
            const svgY = (we.clientY - rect.top - oy) / renderedH * mapHeight;
            setReplayViewport({
                scale: next,
                tx: svgX * (1 - ratio) + ratio * prev.tx,
                ty: svgY * (1 - ratio) + ratio * prev.ty,
            });
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, [mapWidth, mapHeight, setReplayViewport]);

    return {
        scale: replayViewport.scale,
        tx: replayViewport.tx,
        ty: replayViewport.ty,
        zoomIn,
        zoomOut,
        panBy,
        resetViewport,
        centerOn,
        attachWheelZoom,
        attachPanDrag,
        screenToSvg,
        svgRenderScale,
        mapWidth,
        mapHeight,
    };
}
