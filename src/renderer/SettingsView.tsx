import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Key, X as CloseIcon, Minimize } from 'lucide-react';

interface SettingsViewProps {
    onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
    const [dpsReportToken, setDpsReportToken] = useState<string>('');
    const [closeBehavior, setCloseBehavior] = useState<'minimize' | 'quit'>('minimize');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // Load settings
        const loadSettings = async () => {
            const settings = await window.electronAPI.getSettings();
            setDpsReportToken(settings.dpsReportToken || '');
            setCloseBehavior(settings.closeBehavior || 'minimize');
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        window.electronAPI.saveSettings({
            dpsReportToken: dpsReportToken || null,
            closeBehavior
        });

        // Show feedback
        setTimeout(() => {
            setIsSaving(false);
        }, 500);
    };

    return (
        <div className="flex flex-col h-full">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 mb-8"
            >
                <button
                    onClick={onBack}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    Settings
                </h2>
            </motion.div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {/* DPS Report Token Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                            <Key className="w-5 h-5 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-200">dps.report User Token</h3>
                    </div>

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

                    <div className="space-y-3">
                        <input
                            type="text"
                            value={dpsReportToken}
                            onChange={(e) => setDpsReportToken(e.target.value)}
                            placeholder="Enter your dps.report token..."
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder-gray-600 focus:border-blue-500/50 focus:outline-none transition-colors"
                        />
                    </div>
                </motion.div>

                {/* Close Behavior Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
                >
                    <h3 className="text-lg font-semibold text-gray-200 mb-4">Window Close Behavior</h3>

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
                </motion.div>

                {/* Save Button */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex justify-end"
                >
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`px-6 py-3 rounded-xl font-medium transition-all ${isSaving
                                ? 'bg-green-500/30 text-green-400 border border-green-500/50'
                                : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30'
                            }`}
                    >
                        {isSaving ? '✓ Saved!' : 'Save Settings'}
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
