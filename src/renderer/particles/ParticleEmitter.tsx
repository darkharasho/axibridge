import { useEffect, useMemo, useRef, useState } from 'react';
import './particles.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Origin = 'center' | 'left' | 'right' | 'top' | 'edges' | 'surface' | { x: number; y: number };
type Direction = 'out' | 'in';

export interface ParticleEmitterProps {
    origin: Origin;
    direction: Direction;
    count: number;
    spread: number;
    duration: number;
    size: [number, number];
    glow?: boolean;
    color?: string;
    onComplete?: () => void;
}

// ─── Hook: usePrefersReducedMotion ────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return reduced;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Random float in [min, max) */
function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

/** Resolve the origin point (relative to the 0×0 wrapper center) */
function resolveOrigin(origin: Origin, spread: number): { x: number; y: number } {
    if (typeof origin === 'object') return origin;
    switch (origin) {
        case 'left':
            return { x: -spread / 2, y: 0 };
        case 'right':
            // Distribute along the vertical right edge of the badge (~40px tall)
            return { x: 0, y: rand(-20, 20) };
        case 'top':
            return { x: 0, y: -spread / 2 };
        case 'edges': {
            // Random point on the perimeter of a spread-radius circle
            const angle = rand(0, Math.PI * 2);
            return {
                x: Math.cos(angle) * spread / 2,
                y: Math.sin(angle) * spread / 2,
            };
        }
        case 'surface':
            // Random point across a card-shaped rectangle (wide, short)
            return { x: rand(-spread, spread), y: rand(-spread / 6, spread / 6) };
        case 'center':
        default:
            return { x: 0, y: 0 };
    }
}

// ─── Particle style interface ─────────────────────────────────────────────────

interface ParticleStyle {
    position: 'absolute';
    width: string;
    height: string;
    borderRadius: string;
    background: string;
    left: string;
    top: string;
    opacity: number;
    animation: string;
    boxShadow?: string;
    '--particle-end-transform': string;
    [key: string]: string | number | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ParticleEmitter({
    origin,
    direction,
    count,
    spread,
    duration,
    size,
    glow = false,
    color,
    onComplete,
}: ParticleEmitterProps) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const isBulkUploading = document.body.classList.contains('bulk-uploading');
    const particlesDisabled = document.body.classList.contains('particles-disabled');
    const suppressed = prefersReducedMotion || isBulkUploading || particlesDisabled;
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    // Randomize actual particle count within ±20%
    const actualCount = useMemo(() => {
        const min = Math.floor(count * 0.8);
        const max = Math.ceil(count * 1.2);
        return Math.floor(rand(min, max + 1));
    }, [count]);

    // Generate particle styles once on mount
    const particles = useMemo<ParticleStyle[]>(() => {
        if (suppressed) return [];

        const [minSize, maxSize] = size;

        return Array.from({ length: actualCount }, () => {
            // Resolve origin per-particle so 'edges' distributes around the perimeter
            const o = resolveOrigin(origin, spread);
            // 'right' fires nearly horizontal (±12°), others use full 360°
            const angle = origin === 'right'
                ? rand(-Math.PI / 15, Math.PI / 15)
                : rand(0, Math.PI * 2);
            const distance = rand(spread * 0.3, spread);
            const diameter = rand(minSize, maxSize);
            // 'right' uses tighter stagger (all fire nearly together), others spread more
            const delay = origin === 'right'
                ? rand(0, duration * 0.06)
                : rand(0, duration * 0.15);
            // 'right' starts vivid and dense; others use wider opacity range
            const opacity = origin === 'right' ? rand(0.85, 1.0) : rand(0.5, 1.0);

            let endTransform: string;

            if (direction === 'out') {
                const tx = Math.cos(angle) * distance;
                const ty = Math.sin(angle) * distance;
                endTransform = `translate(${tx}px, ${ty}px) scale(0.2)`;
            } else {
                // 'in': start scattered, converge toward origin
                // The particle starts at a scattered position and ends at the origin (scale up)
                const tx = -(Math.cos(angle) * distance);
                const ty = -(Math.sin(angle) * distance);
                endTransform = `translate(${tx}px, ${ty}px) scale(1.3)`;
            }

            // Starting left/top for the particle
            let startX: number;
            let startY: number;

            if (direction === 'out') {
                startX = o.x - diameter / 2;
                startY = o.y - diameter / 2;
            } else {
                // 'in': start scattered
                startX = o.x + Math.cos(angle) * distance - diameter / 2;
                startY = o.y + Math.sin(angle) * distance - diameter / 2;
            }

            const particleColor = color || 'var(--axi-accent)';
            const style: ParticleStyle = {
                position: 'absolute',
                width: `${diameter}px`,
                height: `${diameter}px`,
                borderRadius: '50%',
                background: particleColor,
                left: `${startX}px`,
                top: `${startY}px`,
                opacity,
                animation: `particle-fly ${duration}ms ease-out ${delay}ms 1 forwards`,
                '--particle-end-transform': endTransform,
            };

            if (glow) {
                const glowSize = Math.round(diameter * 1.5);
                style.boxShadow = color
                    ? `0 0 ${glowSize}px ${color}66`
                    : `0 0 ${glowSize}px color-mix(in srgb, var(--axi-accent) 40%, transparent)`;
            }

            return style;
        });
    }, [actualCount, color, direction, duration, glow, origin, suppressed, spread, size]);

    // Schedule onComplete callback
    useEffect(() => {
        const timer = setTimeout(() => {
            onCompleteRef.current?.();
        }, duration + 150);

        return () => clearTimeout(timer);
    }, [duration]);

    const wrapperStyle: React.CSSProperties = {
        position: 'relative',
        width: '0px',
        height: '0px',
        overflow: 'visible',
        pointerEvents: 'none',
    };

    if (isBulkUploading || particlesDisabled) {
        return null;
    }

    if (prefersReducedMotion) {
        return (
            <div style={wrapperStyle}>
                <div className="particle-pulse-fallback" />
            </div>
        );
    }

    return (
        <div style={wrapperStyle}>
            {particles.map((style, i) => (
                <span
                    key={i}
                    className="particle-dot"
                    style={style as React.CSSProperties}
                />
            ))}
        </div>
    );
}
