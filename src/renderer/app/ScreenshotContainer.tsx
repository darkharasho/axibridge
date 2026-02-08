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
    return (
        <div className="fixed top-0 left-0 pointer-events-none opacity-0 overflow-hidden z-[-9999]">
            {screenshotData && (screenshotData as any).mode === 'image-beta' ? (
                <>
                    {embedStatSettings.showSquadSummary && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'squad' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
                    {embedStatSettings.showEnemySummary && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
                    {embedStatSettings.showClassSummary && embedStatSettings.showSquadSummary && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'squad-classes' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
                    {embedStatSettings.showClassSummary && embedStatSettings.showEnemySummary && (
                        <ExpandableLogCard log={screenshotData} isExpanded={true} onToggle={() => { }} screenshotMode={true} screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy-classes' }} embedStatSettings={embedStatSettings} disruptionMethod={disruptionMethod} useClassIcons={showClassIcons} />
                    )}
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
