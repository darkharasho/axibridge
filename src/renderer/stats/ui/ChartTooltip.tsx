import type { ReactNode } from 'react';

/*
    Every chart in this app has a tooltip, and until now there were three
    different ways to draw one:

      - ten sections passed `content={...}` and hand-spelled the box, the same
        string in every one: `bg-slate-900 border axi-edge-rule rounded-lg
        px-3 py-2 text-xs shadow-xl`;
      - seven passed `contentStyle={{ backgroundColor: '#1e293b', borderColor:
        'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}` and
        let recharts draw it;
      - and two of those seven used #161c24 instead, for no reason anybody
        wrote down.

    The second group is the one that mattered. An inline style cannot be
    reached by a stylesheet, so those seven were the only surfaces in the app
    that no theme ever touched: a slate-800 box with pure white text, the same
    in the default theme and under glass, while everything around them moved.

    The object is upstream's `.axi-tooltip`, and the placement is
    `--flow`: recharts renders custom content inside a wrapper it has already
    positioned and transformed, so this box must position itself not at all.
    (The base class appears to work here - a fixed box with auto insets lands
    at its static position - but it only scrolls with the chart because that
    wrapper is transformed, and recharts stops transforming it if a `portal`
    prop is ever passed. See the modifier's note in shells.css.)

    Both exports carry the same box. Which one a site wants depends only on
    whether it builds its own body.
*/

/** The box, for a chart that builds its own tooltip body. */
export function ChartTooltipBox({ className = '', children }: { className?: string; children: ReactNode }) {
    return <div className={`axi-tooltip axi-tooltip--flow ${className}`.trim()}>{children}</div>;
}

type Formatter = (value: unknown, name: unknown, entry: unknown, index: number, payload: unknown) => unknown;
type LabelFormatter = (label: unknown, payload: readonly unknown[]) => ReactNode;

export interface ChartTooltipProps {
    active?: boolean;
    payload?: readonly any[];
    label?: unknown;
    /* recharts spreads every Tooltip prop onto custom content, so a site that
       passed `formatter`/`labelFormatter` to <Tooltip> keeps working with no
       change at the call site - which is what let all seven inline-styled
       tooltips move onto the class without rewriting their number formatting. */
    formatter?: Formatter;
    labelFormatter?: LabelFormatter;
    /** Rows beyond this are dropped; charts with a player per series say 10. */
    maxRows?: number;
}

/** The default body: a label, then one row per series with its swatch. */
export function ChartTooltip({ active, payload, label, formatter, labelFormatter, maxRows }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;

    const heading = labelFormatter ? labelFormatter(label, payload) : (label as ReactNode);
    const rows = maxRows ? payload.slice(0, maxRows) : payload;

    return (
        <ChartTooltipBox>
            {heading != null && heading !== '' && <div className="axi-ink-plain font-medium mb-1">{heading}</div>}
            {rows.map((entry, i) => {
                const formatted = formatter ? formatter(entry.value, entry.name, entry, i, entry.payload) : null;
                /* recharts' formatter contract: either a [value, name] pair or
                   a bare value, in which case the entry keeps its own name. */
                const [value, name] = Array.isArray(formatted)
                    ? formatted
                    : [formatted ?? entry.value, entry.name];
                return (
                    <div key={`${entry.dataKey ?? entry.name}-${i}`} className="flex items-center gap-1.5">
                        {entry.color && (
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: entry.color }}
                            />
                        )}
                        {name != null && name !== '' && <span className="axi-ink-dim">{name as ReactNode}</span>}
                        <span className="axi-ink-plain font-medium">{value as ReactNode}</span>
                    </div>
                );
            })}
        </ChartTooltipBox>
    );
}
