import { ArrowLeft, Share2, Sparkles, Trophy, UploadCloud } from 'lucide-react';

type StatsHeaderProps = {
    embedded: boolean;
    dashboardTitle?: string;
    totalLogs: number;
    onBack: () => void;
    devMockAvailable: boolean;
    devMockUploadState: { uploading: boolean };
    onDevMockUpload: () => void;
    uploadingWeb: boolean;
    onWebUpload: () => void;
    sharing: boolean;
    onShare: () => void;
};

export const StatsHeader = ({
    embedded,
    dashboardTitle,
    totalLogs,
    onBack,
    devMockAvailable,
    devMockUploadState,
    onDevMockUpload,
    uploadingWeb,
    onWebUpload,
    sharing,
    onShare
}: StatsHeaderProps) => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3 shrink-0 px-2 2xl:px-0">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            {!embedded && (
                <button
                    onClick={onBack}
                    className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
            )}
            <div className="space-y-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-yellow-500" />
                    {dashboardTitle || 'Statistics Dashboard'}
                </h1>
                <p className="text-gray-400 text-[11px] sm:text-xs">
                    Performance across {totalLogs} uploaded logs
                </p>
            </div>
        </div>
        {!embedded && (
            <div className="flex items-center gap-3">
                {devMockAvailable && (
                    <button
                        onClick={onDevMockUpload}
                        disabled={devMockUploadState.uploading}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25"
                    >
                        <Sparkles className="w-4 h-4" />
                        {devMockUploadState.uploading ? 'Building...' : 'Dev Mock Upload'}
                    </button>
                )}
                <button
                    onClick={onWebUpload}
                    disabled={uploadingWeb}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    <UploadCloud className="w-4 h-4" />
                    {uploadingWeb ? 'Uploading...' : 'Upload to Web'}
                </button>
                <button
                    onClick={onShare}
                    disabled={sharing}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    <Share2 className="w-4 h-4" />
                    {sharing ? 'Sharing...' : 'Share to Discord'}
                </button>
            </div>
        )}
    </div>
);
