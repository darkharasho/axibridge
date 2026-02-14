import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { resolvePublicAssetPath } from '../../ui/resolvePublicAssetPath';

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

export const SquadCompByFightSection = ({
    fights,
    getProfessionIconPath,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: SquadCompByFightSectionProps) => {
    const [activeFightId, setActiveFightId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const normalizedSearch = search.trim().toLowerCase();
    const commanderTagIcon = resolvePublicAssetPath('svg/commander_tag.svg');

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
        <section
            id="squad-comp-fight"
            data-section-visible={isSectionVisible('squad-comp-fight')}
            data-section-first={isFirstVisibleSection('squad-comp-fight')}
            className={sectionClass('squad-comp-fight', 'mb-8 page-break-avoid')}
        >
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 squad-comp-shell">
                <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-cyan-300" />
                    Squad Comp By Fight
                </h3>
                <div className="mb-4">
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search player or class (highlight matches)..."
                        className="w-full sm:w-[360px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none"
                    />
                </div>
                {fights.length === 0 ? (
                    <div className="text-center text-gray-500 italic py-6">No squad composition data available.</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
                        <aside className="squad-comp-fight-nav bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0">
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Fight Tabs</div>
                            <div className="space-y-1 pr-1 max-h-[560px] xl:max-h-[720px] overflow-y-auto">
                                {fights.map((fight) => {
                                    const isActive = fight.id === activeFightId;
                                    return (
                                        <button
                                            key={fight.id}
                                            onClick={() => setActiveFightId(fight.id)}
                                            className={`squad-comp-fight-nav-item w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isActive
                                                ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100 squad-comp-fight-nav-item--active'
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
                        <div className="rounded-xl border border-white/10 bg-gradient-to-b from-slate-950/55 to-slate-900/45 p-3 squad-comp-board">
                            {!activeFight ? (
                                <div className="text-gray-500 italic py-6 text-center">Select a fight.</div>
                            ) : (
                                <div className="space-y-2.5">
                                    {activeFight.parties.map((party) => (
                                        <div
                                            key={`${activeFight.id}-party-${party.party}`}
                                            className="squad-comp-party-row grid grid-cols-[40px_minmax(0,1fr)] gap-2 rounded-xl border border-white/10 bg-black/25 p-2"
                                        >
                                            <div className="squad-comp-party-badge rounded-lg border border-white/15 bg-slate-900/80 text-center py-2">
                                                <div className="text-[9px] uppercase tracking-widest text-gray-500">P</div>
                                                <div className="text-base font-bold text-gray-100 leading-none">
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
                                                        className={`squad-comp-player-tile rounded-md border border-emerald-300/20 bg-gradient-to-b from-emerald-500/30 to-emerald-700/25 px-2 py-1.5 min-w-0 transition-all ${isMatch
                                                            ? 'ring-2 ring-cyan-300/70 border-cyan-300/60 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                                                            : ''
                                                            } ${player.isCommander ? 'relative overflow-hidden' : ''}`}
                                                    >
                                                        {player.isCommander ? (
                                                            <img
                                                                src={commanderTagIcon}
                                                                alt=""
                                                                aria-hidden="true"
                                                                className="absolute -right-2 -bottom-2 w-12 h-12 object-contain opacity-20 brightness-75 pointer-events-none"
                                                            />
                                                        ) : null}
                                                        <div className="grid grid-cols-[18px_minmax(0,1fr)] grid-rows-2 gap-x-2 items-center min-w-0">
                                                            <div className="row-span-2 flex items-center justify-center">
                                                                {getProfessionIconPath(player.profession) ? (
                                                                    <img
                                                                        src={getProfessionIconPath(player.profession) as string}
                                                                        alt={player.profession}
                                                                        className="squad-comp-player-icon w-5 h-5 object-contain shrink-0 opacity-95"
                                                                    />
                                                                ) : (
                                                                    <span className="squad-comp-player-icon inline-block w-5 h-5 rounded-sm border border-white/15" />
                                                                )}
                                                            </div>
                                                            <div className="squad-comp-player-account text-[11px] font-semibold text-emerald-50 truncate min-w-0 flex items-center gap-1" title={player.account}>
                                                                <span className="truncate min-w-0">{player.account}</span>
                                                            </div>
                                                            <div className="squad-comp-player-character text-[10px] text-emerald-100/80 truncate min-w-0" title={player.characterName || 'Unknown'}>
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
        </section>
    );
};
