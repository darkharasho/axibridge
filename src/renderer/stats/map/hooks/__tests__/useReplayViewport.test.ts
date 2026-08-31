import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useReplayViewport } from '../useReplayViewport';
import { useStatsStore } from '../../../statsStore';

describe('useReplayViewport', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('starts at scale 3 with no translation', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        expect(result.current.scale).toBe(3);
        expect(result.current.tx).toBe(0);
        expect(result.current.ty).toBe(0);
    });

    it('zoomIn and zoomOut update scale in geometric steps', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.zoomIn());
        expect(result.current.scale).toBeGreaterThan(1);
        const s = result.current.scale;
        act(() => result.current.zoomOut());
        expect(result.current.scale).toBeLessThan(s);
    });

    it('resetViewport restores defaults', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.zoomIn());
        act(() => result.current.panBy(30, 40));
        act(() => result.current.resetViewport());
        expect(result.current.scale).toBe(3);
        expect(result.current.tx).toBe(0);
        expect(result.current.ty).toBe(0);
    });

    it('panBy accumulates correctly across rapid calls', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => {
            result.current.panBy(30, 40);
            result.current.panBy(10, 5);
        });
        expect(useStatsStore.getState().replayViewport.tx).toBe(40);
        expect(useStatsStore.getState().replayViewport.ty).toBe(45);
    });

    it('centerOn positions the given world point at the container center', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.centerOn(200, 150));
        // tx = containerWidth/2 - x*scale = 300 - 200*3 = -300
        // ty = containerHeight/2 - y*scale = 300 - 150*3 = -150
        const vp = useStatsStore.getState().replayViewport;
        expect(vp.tx).toBe(-300);
        expect(vp.ty).toBe(-150);
    });

    it('zoomOut decreases scale but not below MIN_SCALE (1)', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => {
            for (let i = 0; i < 50; i++) result.current.zoomOut();
        });
        expect(result.current.scale).toBeGreaterThanOrEqual(1);
    });

    it('zoomIn does not exceed MAX_SCALE (50)', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => {
            for (let i = 0; i < 50; i++) result.current.zoomIn();
        });
        expect(result.current.scale).toBeLessThanOrEqual(50);
    });

    describe('attachPanDrag originSelector', () => {
        /** Container with a map canvas and a HUD panel floating above it. */
        const mkTree = () => {
            const container = document.createElement('div');
            vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
                left: 0, top: 0, width: 600, height: 600,
                right: 600, bottom: 600, x: 0, y: 0, toJSON: () => {},
            } as DOMRect);
            const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            canvas.setAttribute('class', 'replay-canvas');
            const hud = document.createElement('div');
            const hudChild = document.createElement('button');
            hud.appendChild(hudChild);
            container.append(canvas, hud);
            document.body.appendChild(container);
            return { container, canvas, hudChild };
        };

        const drag = (origin: Element) => {
            fireEvent.mouseDown(origin, { button: 0, clientX: 100, clientY: 100 });
            fireEvent.mouseMove(window, { clientX: 200, clientY: 160 });
            fireEvent.mouseUp(window);
        };

        it('pans when the press starts inside the selector', () => {
            const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
            const { container, canvas } = mkTree();
            let cleanup: (() => void) | undefined;
            act(() => { cleanup = result.current.attachPanDrag(container, undefined, { originSelector: '.replay-canvas' }); });

            act(() => drag(canvas));

            expect(useStatsStore.getState().replayViewport.tx).not.toBe(0);
            cleanup?.();
        });

        it('ignores a press that starts on an overlay outside the selector', () => {
            const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
            const { container, hudChild } = mkTree();
            const onDragChange = vi.fn();
            let cleanup: (() => void) | undefined;
            act(() => { cleanup = result.current.attachPanDrag(container, onDragChange, { originSelector: '.replay-canvas' }); });

            act(() => drag(hudChild));

            expect(useStatsStore.getState().replayViewport.tx).toBe(0);
            expect(useStatsStore.getState().replayViewport.ty).toBe(0);
            expect(onDragChange).not.toHaveBeenCalled();
            cleanup?.();
        });

        it('pans from anywhere when no selector is given', () => {
            const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
            const { container, hudChild } = mkTree();
            let cleanup: (() => void) | undefined;
            act(() => { cleanup = result.current.attachPanDrag(container); });

            act(() => drag(hudChild));

            expect(useStatsStore.getState().replayViewport.tx).not.toBe(0);
            cleanup?.();
        });
    });

    it('attachWheelZoom zooms in toward cursor on scroll up', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));

        const el = document.createElement('div');
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 600, height: 600,
            right: 600, bottom: 600, x: 0, y: 0, toJSON: () => {},
        });

        let cleanup: (() => void) | undefined;
        act(() => { cleanup = result.current.attachWheelZoom(el); });

        act(() => {
            fireEvent.wheel(el, { deltaY: -1, clientX: 300, clientY: 300 });
        });

        expect(useStatsStore.getState().replayViewport.scale).toBeGreaterThan(1);
        cleanup?.();
    });

    it('attachWheelZoom zooms out on scroll down', () => {
        useStatsStore.setState({ replayViewport: { scale: 5, tx: 0, ty: 0, followTarget: null } });

        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));

        const el = document.createElement('div');
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 600, height: 600,
            right: 600, bottom: 600, x: 0, y: 0, toJSON: () => {},
        });

        let cleanup: (() => void) | undefined;
        act(() => { cleanup = result.current.attachWheelZoom(el); });

        act(() => {
            fireEvent.wheel(el, { deltaY: 1, clientX: 300, clientY: 300 });
        });

        expect(useStatsStore.getState().replayViewport.scale).toBeLessThan(5);
        cleanup?.();
    });

    it('attachWheelZoom cleanup removes the listener', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        const el = document.createElement('div');
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 600, height: 600,
            right: 600, bottom: 600, x: 0, y: 0, toJSON: () => {},
        });

        let cleanup: (() => void) | undefined;
        act(() => { cleanup = result.current.attachWheelZoom(el); });
        act(() => { cleanup?.(); });

        act(() => { fireEvent.wheel(el, { deltaY: -1, clientX: 300, clientY: 300 }); });
        expect(useStatsStore.getState().replayViewport.scale).toBe(3);
    });
});
