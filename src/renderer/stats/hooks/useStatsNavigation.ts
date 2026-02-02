import { useRef, useState, useEffect, useMemo } from 'react';
import { Trophy, Swords, Shield, Zap, Activity, HelpingHand, ShieldCheck, Map as MapIcon, Users, Skull, Star, HeartPulse } from 'lucide-react';

export const useStatsNavigation = (embedded: boolean) => {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [activeNavId, setActiveNavId] = useState('overview');
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const scrollRafRef = useRef<number | null>(null);
    const scrollDeltaRef = useRef(0);

    const tocItems = useMemo(() => ([
        { id: 'overview', label: 'Overview', icon: Trophy },
        { id: 'top-players', label: 'Top Players', icon: Trophy },
        { id: 'top-skills-outgoing', label: 'Top Skills', icon: Swords },
        { id: 'timeline', label: 'Squad vs Enemy', icon: Users },
        { id: 'map-distribution', label: 'Map Distribution', icon: MapIcon },
        { id: 'boon-output', label: 'Boon Output', icon: ShieldCheck },
        { id: 'offense-detailed', label: 'Offense Detailed', icon: Swords },
        { id: 'conditions-outgoing', label: 'Conditions', icon: Skull },
        { id: 'defense-detailed', label: 'Defense Detailed', icon: Shield },
        { id: 'support-detailed', label: 'Support Detailed', icon: HelpingHand },
        { id: 'healing-stats', label: 'Healing Stats', icon: HeartPulse },
        { id: 'special-buffs', label: 'Special Buffs', icon: Star },
        { id: 'skill-usage', label: 'Skill Usage', icon: Zap },
        { id: 'apm-stats', label: 'APM Breakdown', icon: Activity }
    ]), []);

    const scrollToSection = (id: string) => {
        const targetId = id === 'kdr' ? 'overview' : id;
        const container = scrollContainerRef.current;
        const node = document.getElementById(targetId);
        if (container && node) {
            const containerRect = container.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const rawTop = nodeRect.top - containerRect.top + container.scrollTop;
            const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
            const nextTop = Math.min(Math.max(rawTop - 16, 0), maxTop);
            container.scrollTo({ top: nextTop, behavior: 'smooth' });
            setActiveNavId(targetId);
        } else if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveNavId(targetId);
        }
        setMobileNavOpen(false);
    };

    useEffect(() => {
        if (embedded) return;
        const onWheel = (event: WheelEvent) => {
            const container = scrollContainerRef.current;
            if (!container) return;
            const target = event.target as Node | null;
            if (target && container.contains(target)) return;
            if (event.deltaY === 0) return;
            if (container.scrollHeight <= container.clientHeight) return;
            scrollDeltaRef.current += event.deltaY;
            if (scrollRafRef.current === null) {
                const tick = () => {
                    const current = scrollDeltaRef.current;
                    if (Math.abs(current) < 0.5) {
                        scrollDeltaRef.current = 0;
                        scrollRafRef.current = null;
                        return;
                    }
                    const step = current * 0.2;
                    scrollDeltaRef.current = current - step;
                    container.scrollBy({ top: step, behavior: 'auto' });
                    scrollRafRef.current = requestAnimationFrame(tick);
                };
                scrollRafRef.current = requestAnimationFrame(tick);
            }
            event.preventDefault();
        };
        window.addEventListener('wheel', onWheel, { passive: false });
        // @ts-ignore
        return () => {
            window.removeEventListener('wheel', onWheel);
            if (scrollRafRef.current !== null) {
                cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
            scrollDeltaRef.current = 0;
        };
    }, [embedded]);

    const stepSection = (direction: -1 | 1) => {
        const currentIndex = Math.max(0, tocItems.findIndex((item) => item.id === activeNavId));
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), tocItems.length - 1);
        const nextId = tocItems[nextIndex]?.id;
        if (nextId) scrollToSection(nextId);
    };

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        let raf = 0;
        const updateActiveSection = () => {
            const containerTop = container.getBoundingClientRect().top;
            let currentId = tocItems[0]?.id || 'overview';
            tocItems.forEach((item) => {
                const el = document.getElementById(item.id);
                if (!el) return;
                const offset = el.getBoundingClientRect().top - containerTop;
                if (offset <= 24) {
                    currentId = item.id;
                }
            });
            setActiveNavId((prev) => (prev === currentId ? prev : currentId));
        };
        const onScroll = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateActiveSection);
        };
        updateActiveSection();
        container.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            container.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [tocItems]);

    return {
        mobileNavOpen,
        setMobileNavOpen,
        activeNavId,
        setActiveNavId,
        scrollContainerRef,
        tocItems,
        scrollToSection,
        stepSection
    };
};
