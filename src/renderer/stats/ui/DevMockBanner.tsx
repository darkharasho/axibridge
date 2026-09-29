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
        <div className="mb-3 bg-white/5 border axi-edge-rule rounded-xl px-4 py-2 flex items-center justify-between gap-3">
            <div className="text-xs axi-ink-dim flex items-center gap-2">
                <span className="uppercase tracking-widest text-[10px] axi-ink-warn">Dev Mock</span>
                {devMockUploadState.url ? (
                    <button
                        onClick={() => {
                            const url = devMockUploadState.url;
                            if (url && window.electronAPI?.openExternal) {
                                window.electronAPI.openExternal(url);
                            }
                        }}
                        className="axi-ink-warn hover:text-amber-100 underline underline-offset-2"
                    >
                        {devMockUploadState.url}
                    </button>
                ) : (
                    <span className="axi-ink-dim">{devMockUploadState.message}</span>
                )}
            </div>
            {devMockUploadState.url && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const url = devMockUploadState.url;
                            if (url && window.electronAPI?.openMobilePreview) {
                                window.electronAPI.openMobilePreview(url);
                            }
                        }}
                        className="px-3 py-1 rounded-full text-[10px] border bg-white/5 axi-ink-dim axi-edge-rule hover:text-white"
                    >
                        Mobile
                    </button>
                    <button
                        onClick={() => {
                            const url = devMockUploadState.url;
                            if (url) {
                                navigator.clipboard.writeText(url).catch(() => {});
                            }
                        }}
                        className="px-3 py-1 rounded-full text-[10px] border bg-white/5 axi-ink-dim axi-edge-rule hover:text-white"
                    >
                        Copy Link
                    </button>
                </div>
            )}
        </div>
    );
};
