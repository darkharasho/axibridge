import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Key, X as CloseIcon, Minimize, BarChart3, Users } from 'lucide-react';
import { IEmbedStatSettings, DEFAULT_EMBED_STATS } from './global.d';

interface SettingsViewProps {
    onBack: () => void;
    onEmbedStatSettingsSaved?: (settings: IEmbedStatSettings) => void;
}

// Toggle switch component
function Toggle({ enabled, onChange, label, description }: {
    enabled: boolean;
    onChange: (value: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <div
            className="flex items-center justify-between py-3 cursor-pointer group"
            onClick={() => onChange(!enabled)}
        >
            <div className="flex-1">
                <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                    {label}
                </div>
                {description && (
                    <div className="text-xs text-gray-500 mt-0.5">{description}</div>
                )}
            </div>
            <div
                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-700'
                    }`}
            >
                <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                />
            </div>
        </div>
    );
}

// Section component for grouping settings
function SettingsSection({ title, icon: Icon, children, delay = 0 }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    delay?: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                    <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
            </div>
            {children}
        </motion.div>
    );
}

export function SettingsView({ onBack, onEmbedStatSettingsSaved }: SettingsViewProps) {
    const [dpsReportToken, setDpsReportToken] = useState<string>('');
    const [closeBehavior, setCloseBehavior] = useState<'minimize' | 'quit'>('minimize');
    const [embedStats, setEmbedStats] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [isSaving, setIsSaving] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [showSaved, setShowSaved] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            const settings = await window.electronAPI.getSettings();
            setDpsReportToken(settings.dpsReportToken || '');
            setCloseBehavior(settings.closeBehavior || 'minimize');
            setEmbedStats({ ...DEFAULT_EMBED_STATS, ...(settings.embedStatSettings || {}) });
            setHasLoaded(true);
        };
        loadSettings();
    }, []);

    const saveSettings = () => {
        setIsSaving(true);
        setShowSaved(false);
        window.electronAPI.saveSettings({
            dpsReportToken: dpsReportToken || null,
            closeBehavior,
            embedStatSettings: embedStats
        });
        onEmbedStatSettingsSaved?.(embedStats);

        setTimeout(() => {
            setIsSaving(false);
            setShowSaved(true);
            setTimeout(() => setShowSaved(false), 1200);
        }, 500);
    };

    const handleSave = async () => {
        saveSettings();
    };

    useEffect(() => {
        if (!hasLoaded) return;
        const timeout = setTimeout(() => {
            saveSettings();
        }, 300);
        return () => clearTimeout(timeout);
    }, [dpsReportToken, closeBehavior, embedStats, hasLoaded]);

    const updateEmbedStat = (key: keyof IEmbedStatSettings, value: boolean) => {
        setEmbedStats(prev => ({ ...prev, [key]: value }));
    };

    const updateMaxTopRows = (value: number) => {
        const clamped = Math.min(10, Math.max(1, Math.floor(value)));
        setEmbedStats(prev => ({ ...prev, maxTopListRows: clamped }));
    };

    // Helper to enable/disable all stats in a category
    const setAllTopLists = (enabled: boolean) => {
        setEmbedStats(prev => ({
            ...prev,
            showDamage: enabled,
            showDownContribution: enabled,
            showHealing: enabled,
            showBarrier: enabled,
            showCleanses: enabled,
            showBoonStrips: enabled,
            showCC: enabled,
            showStability: enabled,
            showResurrects: enabled,
            showDistanceToTag: enabled,
            showKills: enabled,
            showDowns: enabled,
            showBreakbarDamage: enabled,
            showDamageTaken: enabled,
            showDeaths: enabled,
            showDodges: enabled,
        }));
    };

    const allTopListsEnabled = embedStats.showDamage && embedStats.showDownContribution &&
        embedStats.showHealing && embedStats.showBarrier && embedStats.showCleanses &&
        embedStats.showBoonStrips && embedStats.showCC && embedStats.showStability &&
        embedStats.showResurrects && embedStats.showDistanceToTag &&
        embedStats.showKills && embedStats.showDowns &&
        embedStats.showBreakbarDamage && embedStats.showDamageTaken &&
        embedStats.showDeaths && embedStats.showDodges;

    return (
        <div className="flex flex-col h-full min-h-0">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 mb-6"
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                        Settings
                    </h2>
                </div>
                <AnimatePresence mode="wait">
                    {(isSaving || showSaved) && (
                        <motion.div
                            key={isSaving ? 'saving' : 'saved'}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="flex items-center gap-2"
                        >
                            <div
                                className={`px-3 py-1 rounded-full text-xs font-semibold border ${isSaving
                                    ? 'bg-green-500/20 text-green-300 border-green-500/40'
                                    : 'bg-white/5 text-gray-400 border-white/10'
                                    }`}
                            >
                                {isSaving ? 'Saving…' : 'Saved'}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {/* DPS Report Token Section */}
                <SettingsSection title="dps.report User Token" icon={Key} delay={0.05}>
                    <p className="text-sm text-gray-400 mb-4">
                        Optional: Add your dps.report user token to associate uploads with your account.
                        You can find your token at{' '}
                        <button
                            onClick={() => window.electronAPI.openExternal('https://dps.report/getUserToken')}
                            className="text-blue-400 hover:text-blue-300 underline transition-colors"
                        >
                            dps.report/getUserToken
                        </button>
                    </p>
                    <input
                        type="text"
                        value={dpsReportToken}
                        onChange={(e) => setDpsReportToken(e.target.value)}
                        placeholder="Enter your dps.report token..."
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder-gray-600 focus:border-blue-500/50 focus:outline-none transition-colors"
                    />
                </SettingsSection>

                {/* Discord Embed Stats - Summary Sections */}
                <SettingsSection title="Discord Embed - Summary Sections" icon={Users} delay={0.1}>
                    <p className="text-sm text-gray-400 mb-4">
                        Configure which summary sections appear in Discord embed notifications.
                    </p>
                    <div className="divide-y divide-white/5">
                        <Toggle
                            enabled={embedStats.showSquadSummary}
                            onChange={(v) => updateEmbedStat('showSquadSummary', v)}
                            label="Squad Summary"
                            description="Players, total damage, DPS, downs, and deaths"
                        />
                        <Toggle
                            enabled={embedStats.showEnemySummary}
                            onChange={(v) => updateEmbedStat('showEnemySummary', v)}
                            label="Enemy Summary"
                            description="Enemy count, damage taken, incoming DPS, enemy downs/kills"
                        />
                        <Toggle
                            enabled={embedStats.showIncomingStats}
                            onChange={(v) => updateEmbedStat('showIncomingStats', v)}
                            label="Incoming Stats"
                            description="Attacks, CC, and strips received (with miss/block rates)"
                        />
                    </div>
                </SettingsSection>

                {/* Discord Embed Stats - Top Lists */}
                <SettingsSection title="Discord Embed - Top 10 Lists" icon={BarChart3} delay={0.15}>
                    <p className="text-sm text-gray-400 mb-2">
                        Configure which top 10 player lists appear in Discord embed notifications.
                    </p>
                    <div className="mb-4 pb-4 border-b border-white/10">
                        <label className="text-xs text-gray-500 block mb-2">Max rows per top 10 list</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={1}
                                max={10}
                                step={1}
                                value={embedStats.maxTopListRows}
                                onChange={(e) => updateMaxTopRows(Number(e.target.value))}
                                className="flex-1 accent-blue-400"
                            />
                            <div className="min-w-8 shrink-0 text-right text-sm text-gray-300 font-mono">
                                {embedStats.maxTopListRows}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end mb-2">
                        <button
                            onClick={() => setAllTopLists(!allTopListsEnabled)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            {allTopListsEnabled ? 'Disable All' : 'Enable All'}
                        </button>
                    </div>
                    <div className="divide-y divide-white/5">
                        <Toggle
                            enabled={embedStats.showDamage}
                            onChange={(v) => updateEmbedStat('showDamage', v)}
                            label="Damage"
                            description="Total damage dealt by each player"
                        />
                        <Toggle
                            enabled={embedStats.showDownContribution}
                            onChange={(v) => updateEmbedStat('showDownContribution', v)}
                            label="Down Contribution"
                            description="Damage dealt to enemies who went into downstate"
                        />
                        <Toggle
                            enabled={embedStats.showHealing}
                            onChange={(v) => updateEmbedStat('showHealing', v)}
                            label="Healing"
                            description="Outgoing healing to squad members"
                        />
                        <Toggle
                            enabled={embedStats.showBarrier}
                            onChange={(v) => updateEmbedStat('showBarrier', v)}
                            label="Barrier"
                            description="Outgoing barrier to squad members"
                        />
                        <Toggle
                            enabled={embedStats.showCleanses}
                            onChange={(v) => updateEmbedStat('showCleanses', v)}
                            label="Cleanses"
                            description="Conditions cleansed (self and allies)"
                        />
                        <Toggle
                            enabled={embedStats.showBoonStrips}
                            onChange={(v) => updateEmbedStat('showBoonStrips', v)}
                            label="Boon Strips"
                            description="Enemy boons stripped"
                        />
                        <Toggle
                            enabled={embedStats.showCC}
                            onChange={(v) => updateEmbedStat('showCC', v)}
                            label="Crowd Control (CC)"
                            description="Hard CC applied to enemies"
                        />
                        <Toggle
                            enabled={embedStats.showStability}
                            onChange={(v) => updateEmbedStat('showStability', v)}
                            label="Stability"
                            description="Stability boon generation"
                        />
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs text-gray-500 mb-3">Additional Stats (disabled by default)</p>
                        <div className="divide-y divide-white/5">
                            <Toggle
                                enabled={embedStats.showResurrects}
                                onChange={(v) => updateEmbedStat('showResurrects', v)}
                                label="Resurrects"
                                description="Downed allies revived"
                            />
                            <Toggle
                                enabled={embedStats.showDistanceToTag}
                                onChange={(v) => updateEmbedStat('showDistanceToTag', v)}
                                label="Distance to Tag"
                                description="Average distance to commander (lower is better)"
                            />
                            <Toggle
                                enabled={embedStats.showKills}
                                onChange={(v) => updateEmbedStat('showKills', v)}
                                label="Kills"
                                description="Enemy kill count"
                            />
                            <Toggle
                                enabled={embedStats.showDowns}
                                onChange={(v) => updateEmbedStat('showDowns', v)}
                                label="Downs"
                                description="Enemy down count"
                            />
                            <Toggle
                                enabled={embedStats.showBreakbarDamage}
                                onChange={(v) => updateEmbedStat('showBreakbarDamage', v)}
                                label="Breakbar Damage"
                                description="Breakbar damage dealt to enemies"
                            />
                            <Toggle
                                enabled={embedStats.showDamageTaken}
                                onChange={(v) => updateEmbedStat('showDamageTaken', v)}
                                label="Damage Taken"
                                description="Damage received from enemies"
                            />
                            <Toggle
                                enabled={embedStats.showDeaths}
                                onChange={(v) => updateEmbedStat('showDeaths', v)}
                                label="Deaths"
                                description="Times the player died"
                            />
                            <Toggle
                                enabled={embedStats.showDodges}
                                onChange={(v) => updateEmbedStat('showDodges', v)}
                                label="Dodges"
                                description="Number of dodges performed"
                            />
                        </div>
                    </div>
                </SettingsSection>

                {/* Close Behavior Section */}
                <SettingsSection title="Window Close Behavior" icon={Minimize} delay={0.2}>
                    <p className="text-sm text-gray-400 mb-4">
                        Choose what happens when you click the close button.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setCloseBehavior('minimize')}
                            className={`flex flex-col items-center justify-center gap-3 py-4 rounded-xl border transition-all ${closeBehavior === 'minimize'
                                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Minimize className="w-6 h-6" />
                            <div className="text-center">
                                <div className="text-sm font-medium">Minimize to Tray</div>
                                <div className="text-xs text-gray-500 mt-1">Keep running in background</div>
                            </div>
                        </button>

                        <button
                            onClick={() => setCloseBehavior('quit')}
                            className={`flex flex-col items-center justify-center gap-3 py-4 rounded-xl border transition-all ${closeBehavior === 'quit'
                                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <CloseIcon className="w-6 h-6" />
                            <div className="text-center">
                                <div className="text-sm font-medium">Quit Application</div>
                                <div className="text-xs text-gray-500 mt-1">Fully close the app</div>
                            </div>
                        </button>
                    </div>
                </SettingsSection>

                <div className="h-[12vh] min-h-10 max-h-28" />
                {/* Save Button (hidden with auto-save) */}
            </div>
        </div>
    );
}
