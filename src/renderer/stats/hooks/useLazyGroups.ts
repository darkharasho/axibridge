import { useCallback, useEffect, useRef, useState } from 'react';
import { useStatsStore } from '../statsStore';

interface GroupDef {
    id: string;
    sectionIds: string[];
}

const DEFAULT_PLACEHOLDER_HEIGHT = 400;

export function useLazyGroups(_groups: GroupDef[]) {
    const activeNavGroup = useStatsStore((s) => s.activeNavGroup);
    const groupHeights = useStatsStore((s) => s.groupHeights);
    const setGroupHeight = useStatsStore((s) => s.setGroupHeight);

    // Track which groups have been mounted (accumulates, never shrinks)
    const [mountedGroups, setMountedGroups] = useState<Set<string>>(
        () => new Set([activeNavGroup]),
    );

    // When activeNavGroup changes, add it to mounted set
    useEffect(() => {
        setMountedGroups((prev) => {
            if (prev.has(activeNavGroup)) return prev;
            return new Set([...prev, activeNavGroup]);
        });
    }, [activeNavGroup]);

    const isGroupMounted = useCallback(
        (groupId: string) => mountedGroups.has(groupId),
        [mountedGroups],
    );

    const getPlaceholderHeight = useCallback(
        (groupId: string) => groupHeights[groupId] ?? DEFAULT_PLACEHOLDER_HEIGHT,
        [groupHeights],
    );

    // Returns only previously-measured heights (0 if never rendered).
    // Use this for placeholders to avoid empty gaps on first mount.
    const getMeasuredHeight = useCallback(
        (groupId: string) => groupHeights[groupId] ?? 0,
        [groupHeights],
    );

    // Track ResizeObservers per group, disconnect old before creating new
    const observersRef = useRef<Map<string, ResizeObserver>>(new Map());

    // Returns a ref callback for ResizeObserver — attach to each group container
    const groupResizeRef = useCallback(
        (groupId: string) => (el: HTMLDivElement | null) => {
            // Disconnect previous observer for this group
            const prev = observersRef.current.get(groupId);
            if (prev) {
                prev.disconnect();
                observersRef.current.delete(groupId);
            }
            if (!el) return;
            let lastHeight = 0;
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const height = Math.round(entry.contentRect.height);
                    // Skip updates when height hasn't meaningfully changed (avoids
                    // store churn during animations that trigger ResizeObserver)
                    if (height > 0 && height !== lastHeight) {
                        lastHeight = height;
                        setGroupHeight(groupId, height);
                    }
                }
            });
            observer.observe(el);
            observersRef.current.set(groupId, observer);
        },
        [setGroupHeight],
    );

    // Cleanup all observers on unmount
    useEffect(() => {
        return () => {
            observersRef.current.forEach((obs) => obs.disconnect());
            observersRef.current.clear();
        };
    }, []);

    return {
        activeNavGroup,
        isGroupMounted,
        getPlaceholderHeight,
        getMeasuredHeight,
        groupResizeRef,
    };
}
