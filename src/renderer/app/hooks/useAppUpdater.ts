import { useEffect, useState } from 'react';

export interface AppUpdaterState {
    updateStatus: string;
    updateProgress: any;
    updateAvailable: boolean;
    updateDownloaded: boolean;
    showUpdateErrorModal: boolean;
    updateError: string | null;
    autoUpdateSupported: boolean;
    autoUpdateDisabledReason: string | null;
}

export interface AppUpdaterActions {
    setUpdateStatus: (status: string) => void;
    setUpdateProgress: (progress: any) => void;
    setUpdateAvailable: (available: boolean) => void;
    setUpdateDownloaded: (downloaded: boolean) => void;
    setShowUpdateErrorModal: (show: boolean) => void;
    setUpdateError: (error: string | null) => void;
    setAutoUpdateSupported: (supported: boolean) => void;
    setAutoUpdateDisabledReason: (reason: string | null) => void;
}

export function useAppUpdater(): AppUpdaterState & AppUpdaterActions {
    const [updateStatus, setUpdateStatus] = useState<string>('');
    const [updateProgress, setUpdateProgress] = useState<any>(null);
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false);
    const [showUpdateErrorModal, setShowUpdateErrorModal] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [autoUpdateSupported, setAutoUpdateSupported] = useState<boolean>(true);
    const [autoUpdateDisabledReason, setAutoUpdateDisabledReason] = useState<string | null>(null);

    useEffect(() => {
        if (updateStatus) console.log('[Updater]', updateStatus);
    }, [updateStatus]);

    useEffect(() => {
        const cleanupMessage = window.electronAPI.onUpdateMessage((message) => setUpdateStatus(message));
        // A timed-out check is not a cancelled one: the main process gives up
        // waiting after a fixed budget, but electron-updater keeps going and
        // still reports the real outcome afterwards. Whichever answer arrives
        // last is the authoritative one, so any real outcome clears a stale
        // error — otherwise a slow-but-successful check leaves the error modal
        // up for the rest of the session.
        const clearStaleError = () => {
            setUpdateError(null);
            setShowUpdateErrorModal(false);
        };
        const cleanupAvailable = window.electronAPI.onUpdateAvailable(() => {
            clearStaleError();
            setUpdateAvailable(true);
            setUpdateStatus('Update available.');
        });
        const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
            clearStaleError();
            setUpdateStatus('App is up to date.');
            setTimeout(() => setUpdateStatus(''), 5000);
        });
        const cleanupError = window.electronAPI.onUpdateError((err) => {
            const errorMessage = err.message || (typeof err === 'string' ? err : 'Unknown update error');
            setUpdateStatus('Error: ' + errorMessage);
            setUpdateError(errorMessage);
            setShowUpdateErrorModal(true);
            setUpdateAvailable(false);
            setUpdateProgress(null);
        });
        const cleanupProgress = window.electronAPI.onDownloadProgress((progress) => {
            setUpdateProgress(progress);
        });
        const cleanupDownloaded = window.electronAPI.onUpdateDownloaded(() => {
            setUpdateStatus('Update downloaded. Ready to restart.');
            setUpdateDownloaded(true);
            setUpdateProgress(null);
        });

        return () => {
            cleanupMessage();
            cleanupAvailable();
            cleanupNotAvailable();
            cleanupError();
            cleanupProgress();
            cleanupDownloaded();
        };
    }, []);

    return {
        updateStatus, setUpdateStatus,
        updateProgress, setUpdateProgress,
        updateAvailable, setUpdateAvailable,
        updateDownloaded, setUpdateDownloaded,
        showUpdateErrorModal, setShowUpdateErrorModal,
        updateError, setUpdateError,
        autoUpdateSupported, setAutoUpdateSupported,
        autoUpdateDisabledReason, setAutoUpdateDisabledReason,
    };
}
