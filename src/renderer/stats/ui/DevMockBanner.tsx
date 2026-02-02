type DevMockBannerProps = {
    embedded: boolean;
    devMockAvailable: boolean;
    devMockUploadState: { message?: string | null; url?: string | null };
};

export const DevMockBanner = ({
    embedded,
    devMockAvailable,
    devMockUploadState
}: DevMockBannerProps) => {
    if (embedded || !devMockAvailable || !devMockUploadState.message) return null;
    return (
        <div className="mb-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-300 flex items-center gap-2">
                <span className="uppercase tracking-widest text-[10px] text-amber-300/70">Dev Mock</span>
                {devMockUploadState.url ? (
                    <button
                        onClick={() => {
                            const url = devMockUploadState.url;
                            if (url && window.electronAPI?.openExternal) {
                                window.electronAPI.openExternal(url);
                            }
                        }}
                        className="text-amber-200 hover:text-amber-100 underline underline-offset-2"
                    >
                        {devMockUploadState.url}
                    </button>
                ) : (
                    <span className="text-gray-300">{devMockUploadState.message}</span>
                )}
            </div>
            {devMockUploadState.url && (
                <button
                    onClick={() => {
                        const url = devMockUploadState.url;
                        if (url && window.electronAPI?.openExternal) {
                            window.electronAPI.openExternal(url);
                        }
                    }}
                    className="px-3 py-1 rounded-full text-[10px] border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                >
                    Open in Browser
                </button>
            )}
        </div>
    );
};
