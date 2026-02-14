import { useEffect, useMemo, useState } from 'react';
import { Swords } from 'lucide-react';

type FightCompPartyRow = {
    party: number;
    players?: Array<{ profession: string }>;
    classCounts: Record<string, number>;
};

type FightCompFight = {
    id: string;
    label: string;
    timestamp: number;
    mapName: string;
    duration: string;
    parties: FightCompPartyRow[];
    enemyClassCounts?: Record<string, number>;
};

type FightCompSectionProps = {
    fights: FightCompFight[];
    getProfessionIconPath: (profession: string) => string | null;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

const formatTimestamp = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown time';
    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return 'Unknown time';
    }
};

export const FightCompSection = ({
    fights,
    getProfessionIconPath,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: FightCompSectionProps) => {
    const [activeFightId, setActiveFightId] = useState<string | null>(null);

    useEffect(() => {
        if (fights.length === 0) {
            if (activeFightId !== null) setActiveFightId(null);
            return;
        }
        if (!activeFightId || !fights.some((fight) => fight.id === activeFightId)) {
            setActiveFightId(fights[0].id);
        }
    }, [fights, activeFightId]);

    const activeFight = useMemo(
        () => fights.find((fight) => fight.id === activeFightId) || null,
        [fights, activeFightId]
    );

    const enemyRows = useMemo(() => {
        if (!activeFight?.enemyClassCounts) return [] as Array<{ profession: string; count: number }>;
        return Object.entries(activeFight.enemyClassCounts)
            .map(([profession, count]) => ({ profession, count: Number(count || 0) }))
            .filter((entry) => entry.count > 0)
            .sort((a, b) => (b.count - a.count) || a.profession.localeCompare(b.profession));
    }, [activeFight]);

    return (
        <section
            id="fight-comp"
            data-section-visible={isSectionVisible('fight-comp')}
            data-section-first={isFirstVisibleSection('fight-comp')}
            className={sectionClass('fight-comp', 'mb-8 page-break-avoid')}
        >
            <div className="fight-comp-shell bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                    <Swords className="w-5 h-5 text-cyan-300" />
                    Fight Comp
                </h3>
                {fights.length === 0 ? (
                    <div className="text-center text-gray-500 italic py-6">No fight composition data available.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
                        <aside className="fight-comp-fight-nav bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 self-start">
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Fight Tabs</div>
                            <div className="space-y-1 pr-1 max-h-[320px] overflow-y-auto">
                                {fights.map((fight) => {
                                    const isActive = fight.id === activeFightId;
                                    return (
                                        <button
                                            key={fight.id}
                                            onClick={() => setActiveFightId(fight.id)}
                                            className={`fight-comp-fight-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isActive
                                                ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
                                        >
                                            <div className="text-[10px] uppercase tracking-widest text-gray-400">{fight.label}</div>
                                            <div className="text-xs font-semibold truncate">{fight.mapName || 'Unknown Map'}</div>
                                            <div className="text-[10px] text-gray-500 truncate">{fight.duration || '--:--'} · {formatTimestamp(fight.timestamp)}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <div className="fight-comp-board rounded-xl border border-white/10 bg-black/30 p-3 overflow-x-auto">
                            {!activeFight ? (
                                <div className="text-gray-500 italic py-6 text-center">Select a fight.</div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 min-w-[640px]">
                                    <div className="fight-comp-card rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                                        <div className="px-3 py-2 bg-white/5 text-[10px] uppercase tracking-widest text-gray-400">Squad Parties</div>
                                        <div className="p-2.5 space-y-1.5">
                                            {activeFight.parties.map((party) => {
                                                const classIcons = Array.isArray(party.players) && party.players.length > 0
                                                    ? party.players
                                                        .map((player) => String(player?.profession || 'Unknown'))
                                                        .filter((profession) => profession && profession !== 'Unknown')
                                                        .sort((a, b) => a.localeCompare(b))
                                                    : Object.entries(party.classCounts || {})
                                                        .flatMap(([profession, count]) =>
                                                            Array.from({ length: Math.max(0, Number(count || 0)) }, () => String(profession))
                                                        )
                                                        .filter((profession) => profession && profession !== 'Unknown')
                                                        .sort((a, b) => a.localeCompare(b));
                                                return (
                                                    <div key={`${activeFight.id}-party-${party.party}`} className="fight-comp-row grid grid-cols-[42px_minmax(0,1fr)] gap-2 items-center rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                                                        <div className="fight-comp-party-badge text-[10px] font-semibold uppercase tracking-widest text-gray-300 text-center rounded-md border border-white/10 bg-black/20 py-1">
                                                            {party.party > 0 ? `P${party.party}` : 'Unk'}
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {classIcons.length > 0 ? classIcons.map((profession, idx) => (
                                                                <span
                                                                    key={`${activeFight.id}-party-${party.party}-${profession}-${idx}`}
                                                                    title={profession}
                                                                    className="fight-comp-class-icon inline-flex items-center justify-center rounded-md border border-white/10 bg-black/20 px-1.5 py-1"
                                                                >
                                                                    {getProfessionIconPath(profession) ? (
                                                                        <img
                                                                            src={getProfessionIconPath(profession) as string}
                                                                            alt={profession}
                                                                            className="w-3.5 h-3.5 object-contain"
                                                                        />
                                                                    ) : (
                                                                        <span className="inline-block w-3.5 h-3.5 rounded-sm border border-white/15" />
                                                                    )}
                                                                </span>
                                                            )) : <span className="text-gray-500 text-[11px]">-</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="fight-comp-card rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                                        <div className="px-3 py-2 bg-white/5 text-[10px] uppercase tracking-widest text-gray-400">Enemy Classes</div>
                                        <div className="p-2.5">
                                            {enemyRows.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {enemyRows.map((entry) => (
                                                        <div key={`${activeFight.id}-enemy-${entry.profession}`} className="fight-comp-row inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                                                            <span className="fight-comp-class-icon inline-flex items-center justify-center rounded-md border border-white/10 bg-black/20 px-1.5 py-1" title={entry.profession}>
                                                                {getProfessionIconPath(entry.profession) ? (
                                                                    <img
                                                                        src={getProfessionIconPath(entry.profession) as string}
                                                                        alt={entry.profession}
                                                                        className="w-3.5 h-3.5 object-contain"
                                                                    />
                                                                ) : (
                                                                    <span className="inline-block w-3.5 h-3.5 rounded-sm border border-white/15" />
                                                                )}
                                                            </span>
                                                            <span className="text-[11px] font-mono text-gray-200">{entry.count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="py-6 text-center text-gray-500 italic text-sm">No enemy class data</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};
