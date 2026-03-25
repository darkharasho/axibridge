import { useEffect, useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

type FightCompPartyRow = {
    party: number;
    players?: Array<{ profession: string; account?: string; characterName?: string }>;
    classCounts: Record<string, number>;
};

type FightCompFight = {
    id: string;
    label: string;
    timestamp: number;
    mapName: string;
    duration: string;
    isWin?: boolean;
    parties: FightCompPartyRow[];
    enemyClassCounts?: Record<string, number>;
};

type FightCompSectionProps = {
    fights: FightCompFight[];
    getProfessionIconPath: (profession: string) => string | null;
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
    getProfessionIconPath
}: FightCompSectionProps) => {
    useStatsSharedContext();
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

    const squadPlayerCount = useMemo(() => {
        if (!activeFight) return 0;
        return activeFight.parties.reduce((sum, party) => {
            if (Array.isArray(party.players) && party.players.length > 0) {
                return sum + party.players.length;
            }
            return sum + Object.values(party.classCounts || {}).reduce((acc, value) => acc + Number(value || 0), 0);
        }, 0);
    }, [activeFight]);

    const enemyPlayerCount = useMemo(
        () => enemyRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
        [enemyRows]
    );

    return (
        <div>
            <div className="flex items-center gap-2 mb-3.5">
                <Swords className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Fight Comp</h3>
            </div>
            <div className="fight-comp-shell">
                {fights.length === 0 ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No fight composition data available.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
                        <aside className="fight-comp-fight-nav bg-[var(--bg-card-inner)] border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] pr-3 flex flex-col min-h-0 overflow-y-auto">
                            <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Fight Tabs</div>
                            <div className="space-y-1 pr-1 max-h-[320px] overflow-y-auto">
                                {fights.map((fight) => {
                                    const isActive = fight.id === activeFightId;
                                    return (
                                        <button
                                            key={fight.id}
                                            onClick={() => setActiveFightId(fight.id)}
                                            className={`fight-comp-fight-nav-item relative w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-xs font-semibold border transition-colors ${isActive
                                                ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                                                : 'bg-[var(--bg-hover)] text-[color:var(--text-secondary)] border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                        >
                                            <span
                                                className={`fight-comp-result-badge absolute right-2 top-2 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${fight.isWin === true
                                                    ? 'fight-comp-result-badge--win'
                                                    : fight.isWin === false
                                                        ? 'fight-comp-result-badge--loss'
                                                        : 'fight-comp-result-badge--unknown'
                                                    }`}
                                            >
                                                {fight.isWin === true ? 'Win' : fight.isWin === false ? 'Loss' : 'Unknown'}
                                            </span>
                                            <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]">{fight.label}</div>
                                            <div className="text-xs font-semibold truncate">{fight.mapName || 'Unknown Map'}</div>
                                            <div className="text-[10px] text-[color:var(--text-secondary)] truncate">{fight.duration || '--:--'} · {formatTimestamp(fight.timestamp)}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        <div className="fight-comp-board rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] p-2.5 overflow-hidden">
                            {!activeFight ? (
                                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">Select a fight.</div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)] gap-2.5 min-w-0">
                                    <div className="fight-comp-card rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] overflow-hidden">
                                        <div className="px-2.5 py-1.5 bg-[var(--bg-hover)] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] flex items-center justify-between gap-2">
                                            <span>Squad Parties</span>
                                            <span className="inline-flex items-center rounded-md border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-1.5 py-0.5 text-[9px] font-semibold tracking-normal text-[color:var(--text-secondary)]">
                                                {squadPlayerCount}
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-white/[0.03] divide-y divide-white/10">
                                            {activeFight.parties.map((party) => {
                                                const classIcons = Array.isArray(party.players) && party.players.length > 0
                                                    ? party.players
                                                        .map((player) => ({
                                                            profession: String(player?.profession || 'Unknown'),
                                                            account: String(player?.account || ''),
                                                            characterName: String(player?.characterName || '')
                                                        }))
                                                        .filter((entry) => entry.profession && entry.profession !== 'Unknown')
                                                        .sort((a, b) =>
                                                            a.profession.localeCompare(b.profession)
                                                            || a.characterName.localeCompare(b.characterName)
                                                            || a.account.localeCompare(b.account)
                                                        )
                                                    : Object.entries(party.classCounts || {})
                                                        .flatMap(([profession, count]) =>
                                                            Array.from({ length: Math.max(0, Number(count || 0)) }, () => ({
                                                                profession: String(profession),
                                                                account: '',
                                                                characterName: ''
                                                            }))
                                                        )
                                                        .filter((entry) => entry.profession && entry.profession !== 'Unknown')
                                                        .sort((a, b) => a.profession.localeCompare(b.profession));
                                                return (
                                                    <div key={`${activeFight.id}-party-${party.party}`} className="fight-comp-row grid grid-cols-[36px_minmax(0,1fr)] gap-1.5 items-center px-1.5 py-1 first:pt-0 last:pb-0">
                                                        <div className="fight-comp-party-badge text-[10px] font-semibold uppercase tracking-widest text-[color:var(--text-secondary)] text-center rounded-md border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] py-0.5">
                                                            {party.party > 0 ? `P${party.party}` : 'Unk'}
                                                        </div>
                                                        <div className="flex flex-wrap gap-x-1.5 gap-y-1">
                                                            {classIcons.length > 0 ? classIcons.map((entry, idx) => (
                                                                <span
                                                                    key={`${activeFight.id}-party-${party.party}-${entry.profession}-${entry.account || entry.characterName || idx}-${idx}`}
                                                                    title={entry.characterName || entry.account
                                                                        ? `${entry.profession} — ${entry.characterName || 'Unknown'} (${entry.account || 'Unknown'})`
                                                                        : entry.profession}
                                                                    className="fight-comp-class-icon fight-comp-class-icon--squad inline-flex items-center justify-center"
                                                                >
                                                                    {getProfessionIconPath(entry.profession) ? (
                                                                        <img
                                                                            src={getProfessionIconPath(entry.profession) as string}
                                                                            alt={entry.profession}
                                                                            className="w-3.5 h-3.5 object-contain"
                                                                        />
                                                                    ) : (
                                                                        <span className="inline-block w-3.5 h-3.5 rounded-sm border border-[color:var(--border-default)]" />
                                                                    )}
                                                                </span>
                                                            )) : <span className="text-[color:var(--text-muted)] text-[11px]">-</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="fight-comp-card rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] overflow-hidden">
                                        <div className="px-2.5 py-1.5 bg-[var(--bg-hover)] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] flex items-center justify-between gap-2">
                                            <span>Enemy Classes</span>
                                            <span className="inline-flex items-center rounded-md border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-1.5 py-0.5 text-[9px] font-semibold tracking-normal text-[color:var(--text-secondary)]">
                                                {enemyPlayerCount}
                                            </span>
                                        </div>
                                        <div className="p-2">
                                            {enemyRows.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {enemyRows.map((entry) => (
                                                        <div key={`${activeFight.id}-enemy-${entry.profession}`} className="fight-comp-row inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-white/[0.03] px-1.5 py-0.5">
                                                            <span className="fight-comp-class-icon inline-flex items-center justify-center rounded-md border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-1 py-0.5" title={entry.profession}>
                                                                {getProfessionIconPath(entry.profession) ? (
                                                                    <img
                                                                        src={getProfessionIconPath(entry.profession) as string}
                                                                        alt={entry.profession}
                                                                        className="w-3 h-3 object-contain"
                                                                    />
                                                                ) : (
                                                                    <span className="inline-block w-3 h-3 rounded-sm border border-[color:var(--border-default)]" />
                                                                )}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-[color:var(--text-primary)]">{entry.count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No enemy class data</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
