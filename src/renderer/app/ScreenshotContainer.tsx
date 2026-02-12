import { ExpandableLogCard } from '../ExpandableLogCard';

export function ScreenshotContainer({
    screenshotData,
    embedStatSettings,
    disruptionMethod,
    showClassIcons,
    enabledTopListCount
}: {
    screenshotData: ILogData | null;
    embedStatSettings: any;
    disruptionMethod: any;
    showClassIcons: boolean;
    enabledTopListCount: number;
}) {
    const resolveEnemyTeamIds = (details: any): number[] => {
        const players = Array.isArray(details?.players) ? details.players : [];
        const targets = Array.isArray(details?.targets) ? details.targets : [];
        const normalizeTeamId = (raw: any): number | null => {
            const value = raw?.teamID ?? raw?.teamId ?? raw?.team;
            const num = Number(value);
            return Number.isFinite(num) && num > 0 ? num : null;
        };
        const allyTeamIds = new Set<number>();
        players.forEach((player: any) => {
            if (player?.notInSquad) return;
            const teamId = normalizeTeamId(player);
            if (teamId !== null) allyTeamIds.add(teamId);
        });

        const teamIds = new Set<number>();
        targets.forEach((target: any) => {
            if (target?.isFake) return;
            if (target?.enemyPlayer === false) return;
            const teamId = normalizeTeamId(target);
            if (teamId === null || allyTeamIds.has(teamId)) return;
            teamIds.add(teamId);
        });
        players.forEach((player: any) => {
            if (!player?.notInSquad) return;
            const teamId = normalizeTeamId(player);
            if (teamId === null || allyTeamIds.has(teamId)) return;
            teamIds.add(teamId);
        });
        return Array.from(teamIds).sort((a, b) => a - b);
    };

    const splitEnemiesByTeam = Boolean((screenshotData as any)?.splitEnemiesByTeam);
    const enemyTeamIds = splitEnemiesByTeam ? resolveEnemyTeamIds((screenshotData as any)?.details || {}) : [];

    return (
        <div className="fixed top-0 left-0 pointer-events-none opacity-0 overflow-hidden z-[-9999]">
            {screenshotData && (screenshotData as any).mode === 'image-beta' ? (
                <>
                    {embedStatSettings.showSquadSummary && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'squad' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
                    {embedStatSettings.showEnemySummary && (!splitEnemiesByTeam || enemyTeamIds.length === 0) && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
                    {embedStatSettings.showEnemySummary && splitEnemiesByTeam && enemyTeamIds.map((teamId) => (
                        <ExpandableLogCard
                            key={`enemy-team-summary-${teamId}`}
                            log={screenshotData}
                            isExpanded={true}
                            onToggle={() => { }}
                            screenshotMode={true}
                            screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy-team', teamId }}
                            embedStatSettings={embedStatSettings}
                            disruptionMethod={disruptionMethod}
                            useClassIcons={showClassIcons}
                        />
                    ))}
                    {embedStatSettings.showClassSummary && embedStatSettings.showSquadSummary && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'squad-classes' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
                    {embedStatSettings.showClassSummary && embedStatSettings.showEnemySummary && (!splitEnemiesByTeam || enemyTeamIds.length === 0) && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy-classes' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
                    {embedStatSettings.showClassSummary && embedStatSettings.showEnemySummary && splitEnemiesByTeam && enemyTeamIds.map((teamId) => (
                        <ExpandableLogCard
                            key={`enemy-team-classes-${teamId}`}
                            log={screenshotData}
                            isExpanded={true}
                            onToggle={() => { }}
                            screenshotMode={true}
                            screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy-team-classes', teamId }}
                            embedStatSettings={embedStatSettings}
                            disruptionMethod={disruptionMethod}
                            useClassIcons={showClassIcons}
                        />
                    ))}
                    {embedStatSettings.showIncomingStats && (
                        <>
                            <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-attacks' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                            <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-cc' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                            <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-strips' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                            <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-blank' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                        </>
                    )}
                    {Array.from({ length: enabledTopListCount }, (_, index) => (
                        <ExpandableLogCard key={`toplist-tile-${index}`} log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'toplist', tileIndex: index }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    ))}
                    <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                </>
            ) : (
                screenshotData && (
                    <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                )
            )}
        </div>
    );
}
