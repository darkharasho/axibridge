import { CSSProperties, useEffect, useRef, useState, type RefObject } from 'react';
import { getProfessionIconPath } from '../../../shared/professionUtils';

const useSmartTooltipPlacement = (
    open: boolean,
    deps: any[],
    wrapperRef: RefObject<HTMLElement>,
    tooltipRef: RefObject<HTMLElement>
) => {
    const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
    const [shiftX, setShiftX] = useState(0);

    useEffect(() => {
        if (!open) return;
        const raf = requestAnimationFrame(() => {
            const wrapper = wrapperRef.current;
            const tooltip = tooltipRef.current;
            if (!wrapper || !tooltip) return;

            const rect = wrapper.getBoundingClientRect();
            const tipRect = tooltip.getBoundingClientRect();

            const findClippingAncestor = (node: HTMLElement | null) => {
                let current = node?.parentElement || null;
                while (current) {
                    const style = window.getComputedStyle(current);
                    const overflow = `${style.overflow}${style.overflowY}${style.overflowX}`;
                    if (/(auto|scroll|hidden)/.test(overflow)) {
                        return current;
                    }
                    current = current.parentElement;
                }
                return null;
            };

            const clipAncestor = findClippingAncestor(wrapper);
            const clipRect = clipAncestor ? clipAncestor.getBoundingClientRect() : {
                top: 0,
                bottom: window.innerHeight,
                left: 0,
                right: window.innerWidth
            };

            const spaceBelow = clipRect.bottom - rect.bottom;
            const spaceAbove = rect.top - clipRect.top;
            const preferred = spaceBelow < tipRect.height + 8 && spaceAbove > spaceBelow ? 'top' : 'bottom';
            setPlacement(preferred);

            const padding = 6;
            const desiredCenter = rect.left + rect.width / 2;
            const minCenter = clipRect.left + padding + tipRect.width / 2;
            const maxCenter = clipRect.right - padding - tipRect.width / 2;
            const clampedCenter = Math.min(Math.max(desiredCenter, minCenter), maxCenter);
            setShiftX(clampedCenter - desiredCenter);
        });
        return () => cancelAnimationFrame(raf);
    }, [open, ...deps]);

    return { placement, shiftX };
};

const buildClassColumns = (counts: Record<string, number>, maxRows = 5) => {
    const entries = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([profession, count]) => ({ profession, count }));
    const columns: Array<Array<{ profession: string; count: number }>> = [];
    for (let i = 0; i < entries.length; i += maxRows) {
        columns.push(entries.slice(i, i + maxRows));
    }
    return columns;
};

const ProfessionIcon = ({
    profession,
    professionList,
    className = 'w-4 h-4'
}: {
    profession: string | undefined;
    professionList?: string[];
    className?: string;
}) => {
    const list = (professionList || []).filter(Boolean);
    const resolvedProfession = profession === 'Multi' && list.length > 0 ? list[0] : profession;
    const iconPath = getProfessionIconPath(resolvedProfession || 'Unknown');
    const showMulti = list.length > 1;
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLSpanElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const { placement, shiftX } = useSmartTooltipPlacement(open, [list.length, className], wrapperRef, tooltipRef);

    if (!iconPath) return null;

    const placementClass = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
    const tooltipStyle = { transform: `translateX(calc(-50% + ${shiftX}px))` };

    return (
        <span
            ref={wrapperRef}
            className={`relative inline-flex shrink-0 ${showMulti ? 'group' : ''}`}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <img src={iconPath} alt={resolvedProfession || 'Unknown'} className={`${className} shrink-0`} />
            {showMulti && (
                <>
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-300 ring-1 ring-[#0f172a]" />
                    <div
                        ref={tooltipRef}
                        style={tooltipStyle}
                        className={`absolute left-1/2 z-50 w-max rounded-md border border-white/10 bg-black/70 backdrop-blur-md px-2 py-1 text-[10px] text-gray-200 shadow-lg opacity-0 pointer-events-none transition-opacity ${placementClass} ${open ? 'opacity-100' : ''}`}
                    >
                        <div className="mb-1 text-[9px] uppercase tracking-wider text-amber-200">Multi</div>
                        <div className="space-y-1">
                            {list.map((prof) => {
                                const itemIcon = getProfessionIconPath(prof || 'Unknown');
                                return (
                                    <div key={prof} className="flex items-center gap-1">
                                        {itemIcon ? (
                                            <img src={itemIcon} alt={prof || 'Unknown'} className="h-3.5 w-3.5" />
                                        ) : null}
                                        <span className="text-gray-100">{prof || 'Unknown'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </span>
    );
};

export const renderProfessionIcon = (
    profession: string | undefined,
    professionList?: string[],
    className = 'w-4 h-4'
) => (
    <ProfessionIcon profession={profession} professionList={professionList} className={className} />
);

export const CountClassTooltip = ({
    count,
    classCounts,
    label,
    className
}: {
    count: number;
    classCounts?: Record<string, number>;
    label: string;
    className?: string;
}) => {
    const columns = buildClassColumns(classCounts || {});
    const hasTooltip = count > 0;
    const [open, setOpen] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({
        position: 'fixed',
        top: -9999,
        left: -9999,
        transform: 'translateX(-50%)'
    });
    const wrapperRef = useRef<HTMLSpanElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const updatePosition = () => {
            const wrapper = wrapperRef.current;
            const tooltip = tooltipRef.current;
            if (!wrapper || !tooltip) return;
            const rect = wrapper.getBoundingClientRect();
            const tipRect = tooltip.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const placeOnTop = spaceBelow < tipRect.height + 8 && spaceAbove > spaceBelow;
            const top = placeOnTop
                ? Math.max(8, rect.top - tipRect.height - 8)
                : Math.min(window.innerHeight - tipRect.height - 8, rect.bottom + 8);
            const desiredCenter = rect.left + rect.width / 2;
            const minCenter = 8 + tipRect.width / 2;
            const maxCenter = window.innerWidth - 8 - tipRect.width / 2;
            const clampedCenter = Math.min(Math.max(desiredCenter, minCenter), maxCenter);
            setTooltipStyle({
                position: 'fixed',
                top,
                left: clampedCenter,
                transform: 'translateX(-50%)'
            });
        };
        const raf = requestAnimationFrame(updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [open, columns.length, count]);

    return (
        <span
            ref={wrapperRef}
            className={`relative inline-flex items-center justify-end ${hasTooltip ? 'group cursor-help' : ''}`}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <span className={className}>{count}</span>
            {hasTooltip && (
                <div
                    ref={tooltipRef}
                    style={tooltipStyle}
                    className={`z-[9999] w-max rounded-md border border-white/10 bg-black/70 backdrop-blur-md px-2 py-1 text-[10px] text-gray-200 shadow-lg opacity-0 pointer-events-none transition-opacity ${open ? 'opacity-100' : ''}`}
                >
                    <div className="mb-1 text-[9px] uppercase tracking-wider text-amber-200">
                        {label}
                    </div>
                    {columns.length > 0 ? (
                        <div className="grid grid-flow-col auto-cols-fr gap-2">
                            {columns.map((col, idx) => (
                                <div key={`${label}-col-${idx}`} className="space-y-1">
                                    {col.map(({ profession, count: profCount }) => {
                                        const iconPath = getProfessionIconPath(profession || 'Unknown');
                                        return (
                                            <div key={profession} className="flex items-center gap-1">
                                                {iconPath ? (
                                                    <img src={iconPath} alt={profession || 'Unknown'} className="h-3.5 w-3.5" />
                                                ) : null}
                                                <span className="text-gray-100">{profession || 'Unknown'}</span>
                                                <span className="text-gray-400">·</span>
                                                <span className="text-gray-200">{profCount}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-[10px] text-gray-500 italic">No class data available</div>
                    )}
                </div>
            )}
        </span>
    );
};

export const SkillBreakdownTooltip = ({
    value,
    label,
    items,
    className
}: {
    value: string;
    label: string;
    items: Array<{ name: string; value: string }>;
    className?: string;
}) => {
    const hasTooltip = items.length > 0;
    const [open, setOpen] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({
        position: 'fixed',
        top: -9999,
        left: -9999,
        transform: 'translateX(-50%)'
    });
    const wrapperRef = useRef<HTMLSpanElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const updatePosition = () => {
            const wrapper = wrapperRef.current;
            const tooltip = tooltipRef.current;
            if (!wrapper || !tooltip) return;
            const wrapRect = wrapper.getBoundingClientRect();
            const tipRect = tooltip.getBoundingClientRect();
            const padding = 8;
            const spaceBelow = window.innerHeight - wrapRect.bottom;
            const spaceAbove = wrapRect.top;
            const top = spaceBelow < tipRect.height + padding && spaceAbove > spaceBelow
                ? Math.max(padding, wrapRect.top - tipRect.height - padding)
                : Math.min(window.innerHeight - tipRect.height - padding, wrapRect.bottom + padding);
            const center = wrapRect.left + wrapRect.width / 2;
            const minLeft = padding + tipRect.width / 2;
            const maxLeft = window.innerWidth - padding - tipRect.width / 2;
            const left = Math.min(Math.max(center, minLeft), maxLeft);
            setTooltipStyle({
                position: 'fixed',
                top,
                left,
                transform: 'translateX(-50%)'
            });
        };
        const raf = requestAnimationFrame(updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [open, items.length]);

    return (
        <span
            ref={wrapperRef}
            className={`relative inline-flex items-center justify-end ${hasTooltip ? 'group cursor-help' : ''} ${className || ''}`}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <span>{value}</span>
            {hasTooltip && (
                <div
                    ref={tooltipRef}
                    style={tooltipStyle}
                    className={`z-[9999] w-64 rounded-md border border-white/10 bg-black/70 px-3 py-2 text-[10px] text-gray-200 shadow-lg backdrop-blur-md opacity-0 pointer-events-none transition-opacity ${open ? 'opacity-100' : ''}`}
                >
                    <div className="text-[9px] uppercase tracking-wider text-amber-200 mb-1">{label}</div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                        {items.map((item) => (
                            <div key={item.name} className="flex items-center justify-between gap-2">
                                <span className="truncate text-gray-100">{item.name}</span>
                                <span className="text-gray-300 font-mono">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </span>
    );
};
