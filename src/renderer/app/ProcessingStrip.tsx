import type { CSSProperties, ReactNode } from 'react';

/* The app's "work is still running, sit tight" line.

   It used to be drawn as a tinted box in a status colour - an amber fill
   inside an amber outline, which is the shape the app uses for a warning that
   wants a decision. Nothing here wants a decision: the work is already
   running and it will finish on its own. So the strip is quiet - the ground,
   the ordinary outline - and the only colour in it is the one cell lit in the
   spinner, which is the part that is actually live. Same rule as the cap on a
   metric card: colour marks the thing it is about, not the frame around it. */
export function ProcessingStrip({ tone = 'busy', children, className = '' }: {
    tone?: 'busy' | 'warn';
    children: ReactNode;
    className?: string;
}) {
    const style: CSSProperties & Record<'--step-on', string> = {
        background: 'var(--axi-ground)',
        borderColor: 'var(--axi-ink-line)',
        color: 'var(--axi-text-dim)',
        '--step-on': tone === 'warn' ? 'var(--axi-warn)' : 'var(--axi-accent)',
    };
    return (
        <div
            className={`axi-chip gap-2 text-xs ${className}`}
            style={style}
            data-role="processing-strip"
            data-tone={tone}
        >
            {/* Turns on the compositor rather than repainting - which matters
                most here, because the thread this is reporting on is the one
                that would otherwise freeze it. Upstream animates transform
                only, so the mark keeps turning through a blocked render. */}
            <span className="axi-spinner" aria-hidden="true" style={{ '--axi-spinner-size': '12px' } as CSSProperties} />
            <span>{children}</span>
        </div>
    );
}
