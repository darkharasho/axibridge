import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParticleEmitter } from '../ParticleEmitter';

// Helper to set up matchMedia mock with a specific prefers-reduced-motion value
function mockMatchMedia(prefersReducedMotion: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
    }));
}

describe('ParticleEmitter', () => {
    beforeEach(() => {
        // Default: no reduced motion
        mockMatchMedia(false);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('renders the correct number of particle dots within ±20% of count', () => {
        const count = 10;
        const { container } = render(
            <ParticleEmitter
                origin="center"
                direction="out"
                count={count}
                spread={100}
                duration={500}
                size={[4, 8]}
            />
        );

        const dots = container.querySelectorAll('.particle-dot');
        const min = Math.floor(count * 0.8);
        const max = Math.ceil(count * 1.2);
        expect(dots.length).toBeGreaterThanOrEqual(min);
        expect(dots.length).toBeLessThanOrEqual(max);
    });

    it('applies inline styles including --particle-end-transform and animation to each particle', () => {
        const { container } = render(
            <ParticleEmitter
                origin="center"
                direction="out"
                count={5}
                spread={80}
                duration={400}
                size={[4, 8]}
            />
        );

        const dots = container.querySelectorAll<HTMLElement>('.particle-dot');
        expect(dots.length).toBeGreaterThan(0);

        dots.forEach((dot) => {
            // Must have --particle-end-transform CSS custom property
            expect(dot.style.getPropertyValue('--particle-end-transform')).toBeTruthy();
            // Must have animation referencing particle-fly keyframe
            expect(dot.style.animation).toMatch(/particle-fly/);
        });
    });

    it('renders reduced-motion fallback instead of particles when prefers-reduced-motion is set', () => {
        mockMatchMedia(true);

        const { container } = render(
            <ParticleEmitter
                origin="center"
                direction="out"
                count={10}
                spread={100}
                duration={500}
                size={[4, 8]}
            />
        );

        // Should render the fallback, not particle dots
        const fallback = container.querySelector('.particle-pulse-fallback');
        const dots = container.querySelectorAll('.particle-dot');

        expect(fallback).not.toBeNull();
        expect(dots.length).toBe(0);
    });

    it('calls onComplete after duration + 150ms and cleans up particles', async () => {
        const onComplete = vi.fn();
        const duration = 300;

        render(
            <ParticleEmitter
                origin="center"
                direction="out"
                count={5}
                spread={80}
                duration={duration}
                size={[4, 8]}
                onComplete={onComplete}
            />
        );

        // Not called yet
        expect(onComplete).not.toHaveBeenCalled();

        // Advance past duration + 150ms
        act(() => {
            vi.advanceTimersByTime(duration + 150);
        });

        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('wrapper element has zero dimensions with overflow visible and pointer-events none', () => {
        const { container } = render(
            <ParticleEmitter
                origin="center"
                direction="out"
                count={5}
                spread={80}
                duration={400}
                size={[4, 8]}
            />
        );

        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper).not.toBeNull();
        expect(wrapper.style.width).toBe('0px');
        expect(wrapper.style.height).toBe('0px');
        expect(wrapper.style.overflow).toBe('visible');
        expect(wrapper.style.pointerEvents).toBe('none');
        expect(wrapper.style.position).toBe('relative');
    });

    it('renders nothing when body has bulk-uploading class', () => {
        document.body.classList.add('bulk-uploading');
        const { container } = render(
            <ParticleEmitter origin="center" direction="out" count={10} spread={50} duration={300} size={[2, 4]} />
        );
        expect(container.querySelectorAll('.particle-dot').length).toBe(0);
        expect(container.querySelector('.particle-pulse-fallback')).toBeNull();
        document.body.classList.remove('bulk-uploading');
    });

    it('applies glow box-shadow to particles when glow prop is true', () => {
        const { container } = render(
            <ParticleEmitter
                origin="center"
                direction="out"
                count={5}
                spread={80}
                duration={400}
                size={[4, 8]}
                glow
            />
        );

        const dots = container.querySelectorAll<HTMLElement>('.particle-dot');
        expect(dots.length).toBeGreaterThan(0);

        dots.forEach((dot) => {
            expect(dot.style.boxShadow).toMatch(/color-mix/);
            expect(dot.style.boxShadow).toMatch(/var\(--axi-accent\)/);
        });
    });
});
