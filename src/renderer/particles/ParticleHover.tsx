import { useCallback, useEffect, useRef, useState } from 'react';
import './particles.css';

interface Dot {
    id: number;
    x: number;
    y: number;
    size: number;
    angle: number;
    distance: number;
    duration: number;
    delay: number;
}

let nextId = 0;

/**
 * Wraps children and emits slow ambient particles outward while hovered.
 * Particles spawn continuously at a low rate and drift outward, fading.
 */
export function ParticleHover({ children, className, style, disabled, color, ...rest }: React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean; color?: string }) {
    const particleColor = color || 'var(--axi-accent)';
    const [hovering, setHovering] = useState(false);
    const [dots, setDots] = useState<Dot[]>([]);
    const intervalRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const spawnDot = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const perimeter = 2 * (w + h);
        const p = Math.random() * perimeter;

        let x: number, y: number, angle: number;
        if (p < w) {
            // Top edge — shoot upward
            x = p; y = 0;
            angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        } else if (p < w + h) {
            // Right edge — shoot right
            x = w; y = p - w;
            angle = (Math.random() - 0.5) * 0.6;
        } else if (p < 2 * w + h) {
            // Bottom edge — shoot downward
            x = p - w - h; y = h;
            angle = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        } else {
            // Left edge — shoot left
            x = 0; y = p - 2 * w - h;
            angle = Math.PI + (Math.random() - 0.5) * 0.6;
        }

        const dot: Dot = {
            id: nextId++,
            x, y,
            size: 3 + Math.random() * 4,
            angle,
            distance: 25 + Math.random() * 50,
            duration: 2200 + Math.random() * 1200,
            delay: 0,
        };
        setDots(prev => [...prev, dot]);
        setTimeout(() => {
            setDots(prev => prev.filter(d => d.id !== dot.id));
        }, dot.duration + 100);
    }, []);

    useEffect(() => {
        if (hovering && !disabled) {
            // Spawn a few immediately
            spawnDot();
            spawnDot();
            spawnDot();
            intervalRef.current = window.setInterval(spawnDot, 300);
        } else {
            if (intervalRef.current !== null) {
                window.clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
        return () => {
            if (intervalRef.current !== null) {
                window.clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [hovering, disabled, spawnDot]);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ position: 'relative', ...style }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            {...rest}
        >
            {children}
            <div style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}>
                {dots.map(dot => {
                    const tx = Math.cos(dot.angle) * dot.distance;
                    const ty = Math.sin(dot.angle) * dot.distance;
                    return (
                        <span
                            key={dot.id}
                            className="particle-dot"
                            style={{
                                position: 'absolute',
                                left: `${dot.x}px`,
                                top: `${dot.y}px`,
                                width: `${dot.size}px`,
                                height: `${dot.size}px`,
                                borderRadius: '20%',
                                background: particleColor,
                                opacity: 0.7,
                                boxShadow: `0 0 ${Math.round(dot.size * 1.5)}px color-mix(in srgb, ${particleColor} 40%, transparent)`,
                                animation: `particle-fly ${dot.duration}ms ease-out forwards`,
                                '--particle-end-transform': `translate(${tx}px, ${ty}px) scale(0.3)`,
                            } as React.CSSProperties}
                        />
                    );
                })}
            </div>
        </div>
    );
}
