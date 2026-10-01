import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { getProfessionColor, hexToRgba } from '../../../shared/professionUtils';

type SquadCompPlayer = {
    account: string;
    characterName: string;
    profession: string;
    isCommander?: boolean;
};

type SquadCompParty = {
    party: number;
    players: SquadCompPlayer[];
};

type SquadCompFight = {
    id: string;
    label: string;
    timestamp: number;
    mapName: string;
    duration: string;
    parties: SquadCompParty[];
};

type SquadCompByFightSectionProps = {
    fights: SquadCompFight[];
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

export const SquadCompByFightSection = ({
    fights: fightsOldestFirst,
    getProfessionIconPath
}: SquadCompByFightSectionProps) => {
    useStatsSharedContext();
    // Fights arrive oldest-first; tabs list (and default to) the newest.
    const fights = useMemo(() => [...fightsOldestFirst].reverse(), [fightsOldestFirst]);
    const [activeFightId, setActiveFightId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const normalizedSearch = search.trim().toLowerCase();

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
    const matchesPlayer = (player: SquadCompPlayer) => {
        if (!normalizedSearch) return false;
        const account = String(player.account || '').toLowerCase();
        const character = String(player.characterName || '').toLowerCase();
        const profession = String(player.profession || '').toLowerCase();
        return account.includes(normalizedSearch)
            || character.includes(normalizedSearch)
            || profession.includes(normalizedSearch);
    };

    return (
        <div className="squad-comp-shell">
            <div className="flex items-center gap-2 mb-3.5">
                <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Squad Comp By Fight</h3>
            </div>
                <div className="mb-4">
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search player or class (highlight matches)..."
                        className="axi-input"
                    />
                </div>
                {fights.length === 0 ? (
                    <div className="axi-empty">No squad composition data available.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
                        <aside className="squad-comp-fight-nav rounded-[var(--axi-radius-sm)] px-3 pt-3 pb-2 flex flex-col min-h-0">
                            <div className="text-xs uppercase tracking-widest text-[color:var(--axi-text-dim)] mb-2">Fight Tabs</div>
                            <div className="space-y-1 pr-1 max-h-[560px] xl:max-h-[720px] overflow-y-auto">
                                {fights.map((fight) => {
                                    const isActive = fight.id === activeFightId;
                                    return (
                                        <button
                                            key={fight.id}
                                            onClick={() => setActiveFightId(fight.id)}
                                            /* Three stacked lines, not a label - so this is a card you
                                               press, not a rail row, and a selected card takes the
                                               accent edge rather than the accent fill - drawn by the
                                               language from aria-pressed. */
                                            className="axi-card w-full text-left"
                                            aria-pressed={isActive}
                                        >
                                            <div className={`text-[10px] uppercase tracking-widest ${isActive ? 'axi-ink-accent' : 'axi-ink-dim'}`}>{fight.label}</div>
                                            <div className="text-xs font-semibold truncate">{fight.mapName || 'Unknown Map'}</div>
                                            <div className="text-[10px] text-[color:var(--axi-text-dim)] truncate">{fight.duration || '--:--'} · {formatTimestamp(fight.timestamp)}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>
                        <div className="axi-well p-3 squad-comp-board">
                            {!activeFight ? (
                                <div className="axi-empty">Select a fight.</div>
                            ) : (
                                <div className="space-y-2.5">
                                    {activeFight.parties.map((party) => (
                                        <div
                                            key={`${activeFight.id}-party-${party.party}`}
                                            className="squad-comp-party-row grid grid-cols-[40px_minmax(0,1fr)] gap-2 p-2"
                                        >
                                            <div className="squad-comp-party-badge axi-well axi-well--sm text-center">
                                                <div className="text-[9px] uppercase tracking-widest text-[color:var(--axi-text-faint)]">P</div>
                                                <div className="text-base font-bold text-[color:var(--axi-text)] leading-none">
                                                    {party.party > 0 ? party.party : '-'}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1 min-w-0">
                                                {party.players.map((player, index) => (
                                                    (() => {
                                                        const isMatch = matchesPlayer(player);
                                                        return (
                                                    <div
                                                        key={`${activeFight.id}-${party.party}-${player.account}-${index}`}
                                                        className={`squad-comp-player-tile axi-well axi-well--sm [--axi-well-pad:6px_8px] min-w-0 transition-all ${isMatch
                                                            ? 'ring-1 ring-[color:var(--axi-accent)] border-[color:var(--axi-accent)] bg-[var(--axi-surface-paint)]'
                                                            : ''
                                                            }`}
                                                        style={{
                                                            borderLeftWidth: '2px',
                                                            borderLeftColor: getProfessionColor(player.profession),
                                                        }}
                                                    >
                                                        <div className="grid grid-cols-[18px_minmax(0,1fr)] grid-rows-2 gap-x-2 items-center min-w-0">
                                                            <div
                                                                className="row-span-2 flex items-center justify-center w-5 h-5 flex-shrink-0"
                                                                style={{
                                                                    backgroundColor: hexToRgba(getProfessionColor(player.profession), 0.08),
                                                                }}
                                                            >
                                                                {getProfessionIconPath(player.profession) ? (
                                                                    <img
                                                                        src={getProfessionIconPath(player.profession) as string}
                                                                        alt={player.profession}
                                                                        className="squad-comp-player-icon w-5 h-5 object-contain shrink-0 opacity-95"
                                                                    />
                                                                ) : (
                                                                    <span className="squad-comp-player-icon inline-block w-5 h-5 axi-well axi-well--sm [--axi-well-pad:0]" />
                                                                )}
                                                            </div>
                                                            <div className="squad-comp-player-account text-[11px] font-semibold text-[color:var(--axi-text)] truncate min-w-0 flex items-center gap-1" title={player.account}>
                                                                <span className="truncate min-w-0">{player.account}</span>
                                                                {player.isCommander ? (
                                                                    <span
                                                                        className="inline-flex items-center justify-center w-3 h-3 flex-shrink-0 text-[8px] leading-none text-[color:var(--axi-warn)]"
                                                                        style={{ background: 'var(--axi-surface-raised-paint)', border: 'var(--axi-border-control) solid var(--axi-warn)' }}
                                                                        title="Commander"
                                                                    >★</span>
                                                                ) : null}
                                                            </div>
                                                            <div className="squad-comp-player-character text-[10px] text-[color:var(--axi-text-dim)] truncate min-w-0" title={player.characterName || 'Unknown'}>
                                                                {player.characterName || 'Unknown'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                        );
                                                    })()
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
        </div>
    );
};
