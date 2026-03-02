import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'node:path';
import {
    ensureDevDatasetsDir,
    isDevDatasetTempFolder,
    readDevDatasetStatus,
    sanitizeDevDatasetId,
    getDevDatasetFolderName,
    getDevDatasetTempFolderName,
    normalizeDevDatasetSnapshot,
    writeDevDatasetStatus,
    getDatasetRelativeLogPath,
    buildDatasetIntegrity,
    validateDatasetIntegrity,
    resolveOrderedDatasetLogPaths,
    readJsonFilesWithLimit,
    writeJsonFilesWithLimit,
    devDatasetFolderCache,
    devDatasetFinalFolderCache,
    devDatasetManifestCache,
    DEV_DATASET_TEMP_PREFIX,
    DEV_DATASET_INTEGRITY_FILE,
    MAX_DEV_DATASET_REPORT_BYTES,
} from '../devDatasets';
import { pruneDetailsForStats, buildManifestEntry, resolveDetailsUploadTime } from '../detailsProcessing';

export function registerDatasetHandlers() {
    ipcMain.handle('list-dev-datasets', async () => {
        try {
            const dir = await ensureDevDatasetsDir();
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            const datasets = [];
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (isDevDatasetTempFolder(entry.name)) continue;
                const datasetDir = path.join(dir, entry.name);
                try {
                    const status = await readDevDatasetStatus(datasetDir);
                    if (status && status.complete !== true) continue;
                } catch {
                    // Ignore unreadable status and continue listing legacy datasets.
                }
                const metaPath = path.join(dir, entry.name, 'meta.json');
                try {
                    const raw = await fs.promises.readFile(metaPath, 'utf-8');
                    const parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed !== 'object') continue;
                    datasets.push({
                        id: parsed.id || entry.name,
                        name: parsed.name || 'Unnamed Dataset',
                        createdAt: parsed.createdAt || new Date(0).toISOString()
                    });
                } catch {
                    // Ignore unreadable dataset folders.
                }
            }
            datasets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            return { success: true, datasets };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to list datasets.' };
        }
    });

    ipcMain.handle('save-dev-dataset', async (event, payload: { id?: string; name: string; logs: any[]; report?: any; snapshot?: any }) => {
        try {
            const dir = await ensureDevDatasetsDir();
            const baseId = payload.id || `${Date.now()}`;
            const id = sanitizeDevDatasetId(baseId) || `${Date.now()}`;
            const name = payload.name?.trim() || 'Dataset';
            const createdAt = new Date().toISOString();
            const folderName = getDevDatasetFolderName(id, name);
            const tempFolderName = getDevDatasetTempFolderName(folderName);
            const finalDatasetDir = path.join(dir, folderName);
            const datasetDir = path.join(dir, tempFolderName);
            const logsDir = path.join(datasetDir, 'logs');
            if (fs.existsSync(finalDatasetDir)) return { success: false, error: 'Dataset already exists.' };
            if (fs.existsSync(datasetDir)) {
                await fs.promises.rm(datasetDir, { recursive: true, force: true });
            }
            await fs.promises.mkdir(logsDir, { recursive: true });
            event.sender.send('dev-dataset-save-progress', { id, stage: 'folder', written: 0, total: 0 });
            const meta = { id, name, createdAt, folder: folderName };
            await fs.promises.writeFile(path.join(datasetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
            await fs.promises.writeFile(path.join(datasetDir, 'report.json'), JSON.stringify(payload.report || null), 'utf-8');
            await fs.promises.writeFile(path.join(datasetDir, 'snapshot.json'), JSON.stringify(normalizeDevDatasetSnapshot(payload.snapshot, app.getVersion()), null, 2), 'utf-8');
            await fs.promises.writeFile(path.join(datasetDir, 'manifest.json'), JSON.stringify({ ...meta, logs: [] }, null, 2), 'utf-8');
            await writeDevDatasetStatus(datasetDir, { complete: false, createdAt });
            const logs = Array.isArray(payload.logs) ? payload.logs : [];
            const manifestEntries: any[] = [];
            const materializedEntries: Array<{ path: string; data: any }> = [];
            for (const { log, index } of logs.map((log, index) => ({ log, index }))) {
                const details = log?.details ?? log;
                const pruned = pruneDetailsForStats(details);
                manifestEntries.push(buildManifestEntry(pruned, getDatasetRelativeLogPath(index), index));
                materializedEntries.push({
                    path: path.join(logsDir, `log-${index + 1}.json`),
                    data: pruned
                });
            }
            if (materializedEntries.length > 0) {
                await writeJsonFilesWithLimit(materializedEntries, 8, (written, total) => {
                    event.sender.send('dev-dataset-save-progress', { id, stage: 'logs', written, total });
                });
            }
            if (manifestEntries.length > 0) {
                await fs.promises.writeFile(
                    path.join(datasetDir, 'manifest.json'),
                    JSON.stringify({ ...meta, logs: manifestEntries }, null, 2),
                    'utf-8'
                );
            }
            const integrity = await buildDatasetIntegrity(datasetDir);
            await fs.promises.writeFile(path.join(datasetDir, DEV_DATASET_INTEGRITY_FILE), JSON.stringify(integrity, null, 2), 'utf-8');
            await writeDevDatasetStatus(datasetDir, { complete: true, createdAt, completedAt: new Date().toISOString(), totalLogs: logs.length });
            await fs.promises.rename(datasetDir, finalDatasetDir);
            event.sender.send('dev-dataset-save-progress', { id, stage: 'done', written: logs.length, total: logs.length });
            return { success: true, dataset: { id, name, createdAt } };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to save dataset.' };
        }
    });

    ipcMain.handle('begin-dev-dataset-save', async (_event, payload: { id?: string; name: string; report?: any; snapshot?: any }) => {
        try {
            const dir = await ensureDevDatasetsDir();
            const baseId = payload.id || `${Date.now()}`;
            const id = sanitizeDevDatasetId(baseId) || `${Date.now()}`;
            const name = payload.name?.trim() || 'Dataset';
            const createdAt = new Date().toISOString();
            const folderName = getDevDatasetFolderName(id, name);
            const tempFolderName = getDevDatasetTempFolderName(folderName);
            const finalDatasetDir = path.join(dir, folderName);
            const datasetDir = path.join(dir, tempFolderName);
            const logsDir = path.join(datasetDir, 'logs');
            if (fs.existsSync(finalDatasetDir)) return { success: false, error: 'Dataset already exists.' };
            if (fs.existsSync(datasetDir)) {
                await fs.promises.rm(datasetDir, { recursive: true, force: true });
            }
            await fs.promises.mkdir(logsDir, { recursive: true });
            const meta = { id, name, createdAt, folder: folderName };
            await fs.promises.writeFile(path.join(datasetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
            await fs.promises.writeFile(path.join(datasetDir, 'report.json'), JSON.stringify(payload.report || null), 'utf-8');
            await fs.promises.writeFile(path.join(datasetDir, 'snapshot.json'), JSON.stringify(normalizeDevDatasetSnapshot(payload.snapshot, app.getVersion()), null, 2), 'utf-8');
            await fs.promises.writeFile(path.join(datasetDir, 'manifest.json'), JSON.stringify({ ...meta, logs: [] }, null, 2), 'utf-8');
            await writeDevDatasetStatus(datasetDir, { complete: false, createdAt });
            devDatasetFolderCache.set(id, datasetDir);
            devDatasetFinalFolderCache.set(id, finalDatasetDir);
            devDatasetManifestCache.set(id, { meta, logs: [] });
            return { success: true, dataset: { id, name, createdAt } };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to start dataset save.' };
        }
    });

    ipcMain.handle('append-dev-dataset-logs', async (event, payload: { id: string; logs: any[]; startIndex: number; total?: number }) => {
        try {
            const id = sanitizeDevDatasetId(payload.id);
            if (!id) return { success: false, error: 'Invalid dataset id.' };
            let datasetDir = devDatasetFolderCache.get(id);
            if (!datasetDir) {
                const dir = await ensureDevDatasetsDir();
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${DEV_DATASET_TEMP_PREFIX}${id}-`));
                if (!folder) return { success: false, error: 'Dataset not found.' };
                datasetDir = path.join(dir, folder.name);
                devDatasetFolderCache.set(id, datasetDir);
                devDatasetFinalFolderCache.set(id, path.join(dir, folder.name.replace(DEV_DATASET_TEMP_PREFIX, '')));
            }
            const logsDir = path.join(datasetDir, 'logs');
            const logs = Array.isArray(payload.logs) ? payload.logs : [];
            const entries: Array<{ path: string; data: any }> = [];
            for (let index = 0; index < logs.length; index += 1) {
                const log = logs[index];
                const details = log?.details ?? log;
                const pruned = pruneDetailsForStats(details);
                const manifest = devDatasetManifestCache.get(id);
                if (manifest) {
                    manifest.logs.push(buildManifestEntry(pruned, getDatasetRelativeLogPath(payload.startIndex + index), payload.startIndex + index));
                }
                entries.push({
                    path: path.join(logsDir, `log-${payload.startIndex + index + 1}.json`),
                    data: pruned
                });
            }
            if (entries.length > 0) {
                await writeJsonFilesWithLimit(entries, 8);
            }
            if (payload.total) {
                const written = Math.min(payload.startIndex + logs.length, payload.total);
                event.sender.send('dev-dataset-save-progress', { id, stage: 'logs', written, total: payload.total });
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to append dataset logs.' };
        }
    });

    ipcMain.handle('finish-dev-dataset-save', async (_event, payload: { id: string; total: number }) => {
        try {
            const id = sanitizeDevDatasetId(payload.id);
            if (!id) return { success: false, error: 'Invalid dataset id.' };
            let datasetDir = devDatasetFolderCache.get(id);
            if (!datasetDir) {
                const dir = await ensureDevDatasetsDir();
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${DEV_DATASET_TEMP_PREFIX}${id}-`));
                if (!folder) return { success: false, error: 'Dataset not found.' };
                datasetDir = path.join(dir, folder.name);
                devDatasetFolderCache.set(id, datasetDir);
            }
            let finalDatasetDir = devDatasetFinalFolderCache.get(id);
            if (!finalDatasetDir) {
                const dir = await ensureDevDatasetsDir();
                const folderName = path.basename(datasetDir);
                finalDatasetDir = path.join(dir, folderName.startsWith(DEV_DATASET_TEMP_PREFIX) ? folderName.replace(DEV_DATASET_TEMP_PREFIX, '') : folderName);
                devDatasetFinalFolderCache.set(id, finalDatasetDir);
            }
            const manifest = devDatasetManifestCache.get(id);
            if (manifest) {
                await fs.promises.writeFile(
                    path.join(datasetDir, 'manifest.json'),
                    JSON.stringify({ ...manifest.meta, logs: manifest.logs }, null, 2),
                    'utf-8'
                );
            }
            const integrity = await buildDatasetIntegrity(datasetDir);
            await fs.promises.writeFile(path.join(datasetDir, DEV_DATASET_INTEGRITY_FILE), JSON.stringify(integrity, null, 2), 'utf-8');
            await writeDevDatasetStatus(datasetDir, { complete: true, completedAt: new Date().toISOString(), totalLogs: payload.total });
            if (fs.existsSync(finalDatasetDir)) return { success: false, error: 'Dataset already exists.' };
            await fs.promises.rename(datasetDir, finalDatasetDir);
            devDatasetManifestCache.delete(id);
            devDatasetFolderCache.delete(id);
            devDatasetFinalFolderCache.delete(id);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to finish dataset save.' };
        }
    });

    ipcMain.handle('load-dev-dataset', async (_event, payload: { id: string; allowLogsOnlyOnIntegrityFailure?: boolean }) => {
        try {
            const dir = await ensureDevDatasetsDir();
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            const id = sanitizeDevDatasetId(payload.id);
            if (!id) return { success: false, error: 'Invalid dataset id.' };
            const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${id}-`));
            if (!folder) return { success: false, error: 'Dataset not found.' };
            const datasetDir = path.join(dir, folder.name);
            const status = await readDevDatasetStatus(datasetDir);
            if (status && status.complete !== true) {
                return { success: false, error: 'Dataset is incomplete and cannot be loaded yet.' };
            }
            const integrity = await validateDatasetIntegrity(datasetDir);
            const logsOnlyFallback = !integrity.ok;
            if (logsOnlyFallback && !payload.allowLogsOnlyOnIntegrityFailure) {
                return {
                    success: false,
                    error: `Dataset integrity check failed: ${integrity.issues.join(' ')}`,
                    canLoadLogsOnly: true,
                    integrity
                };
            }
            const metaPath = path.join(datasetDir, 'meta.json');
            const reportPath = path.join(datasetDir, 'report.json');
            const snapshotPath = path.join(datasetDir, 'snapshot.json');
            const manifestPath = path.join(datasetDir, 'manifest.json');
            const logsDir = path.join(datasetDir, 'logs');
            const metaRaw = await fs.promises.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(metaRaw);
            let manifest: any = null;
            try {
                if (fs.existsSync(manifestPath)) {
                    const manifestRaw = await fs.promises.readFile(manifestPath, 'utf-8');
                    manifest = JSON.parse(manifestRaw);
                }
            } catch (manifestError: any) {
                console.warn('[Main] Failed to read dev dataset manifest.json:', manifestError?.message || manifestError);
            }
            let report: any = null;
            if (!logsOnlyFallback) {
                try {
                    const reportStat = await fs.promises.stat(reportPath);
                    if (reportStat.size <= MAX_DEV_DATASET_REPORT_BYTES) {
                        const reportRaw = await fs.promises.readFile(reportPath, 'utf-8');
                        report = JSON.parse(reportRaw);
                    } else {
                        console.warn(`[Main] Skipping dev dataset report.json (${reportStat.size} bytes) to avoid OOM.`);
                    }
                } catch (reportError: any) {
                    console.warn('[Main] Failed to read dev dataset report.json:', reportError?.message || reportError);
                }
            }
            let snapshot: any = null;
            if (!logsOnlyFallback) {
                try {
                    if (fs.existsSync(snapshotPath)) {
                        const snapshotRaw = await fs.promises.readFile(snapshotPath, 'utf-8');
                        snapshot = normalizeDevDatasetSnapshot(JSON.parse(snapshotRaw), app.getVersion());
                    }
                } catch (snapshotError: any) {
                    console.warn('[Main] Failed to read dev dataset snapshot.json:', snapshotError?.message || snapshotError);
                }
            }
            const logPaths = await resolveOrderedDatasetLogPaths(datasetDir, logsDir, manifest, snapshot);
            const snapshotLogIds = Array.isArray(snapshot?.state?.datasetLogIds) ? snapshot.state.datasetLogIds : null;
            const logs = await readJsonFilesWithLimit(logPaths, 1);
            const slimLogs = logs.map((entry: any, index: number) => {
                const details = entry?.details ?? entry ?? {};
                const snapshotId = snapshotLogIds && typeof snapshotLogIds[index] === 'string'
                    ? snapshotLogIds[index]
                    : null;
                return {
                    id: snapshotId || entry?.id || details?.id || `dev-log-${index + 1}`,
                    filePath: logPaths[index],
                    status: 'calculating',
                    detailsAvailable: true,
                    fightName: details?.fightName || entry?.fightName,
                    encounterDuration: details?.encounterDuration || entry?.encounterDuration,
                    uploadTime: resolveDetailsUploadTime(details, entry)
                };
            });
            return { success: true, dataset: { ...meta, logs: slimLogs, report, manifest, snapshot }, integrity, logsOnlyFallback };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load dataset.' };
        }
    });

    ipcMain.handle('load-dev-dataset-chunked', async (event, payload: { id: string; chunkSize?: number; allowLogsOnlyOnIntegrityFailure?: boolean }) => {
        try {
            const dir = await ensureDevDatasetsDir();
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            const id = sanitizeDevDatasetId(payload.id);
            if (!id) return { success: false, error: 'Invalid dataset id.' };
            const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${id}-`));
            if (!folder) return { success: false, error: 'Dataset not found.' };
            const datasetDir = path.join(dir, folder.name);
            const status = await readDevDatasetStatus(datasetDir);
            if (status && status.complete !== true) {
                return { success: false, error: 'Dataset is incomplete and cannot be loaded yet.' };
            }
            const integrity = await validateDatasetIntegrity(datasetDir);
            const logsOnlyFallback = !integrity.ok;
            if (logsOnlyFallback && !payload.allowLogsOnlyOnIntegrityFailure) {
                return {
                    success: false,
                    error: `Dataset integrity check failed: ${integrity.issues.join(' ')}`,
                    canLoadLogsOnly: true,
                    integrity
                };
            }
            const metaPath = path.join(datasetDir, 'meta.json');
            const reportPath = path.join(datasetDir, 'report.json');
            const snapshotPath = path.join(datasetDir, 'snapshot.json');
            const manifestPath = path.join(datasetDir, 'manifest.json');
            const logsDir = path.join(datasetDir, 'logs');
            const metaRaw = await fs.promises.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(metaRaw);
            let manifest: any = null;
            try {
                if (fs.existsSync(manifestPath)) {
                    const manifestRaw = await fs.promises.readFile(manifestPath, 'utf-8');
                    manifest = JSON.parse(manifestRaw);
                }
            } catch (manifestError: any) {
                console.warn('[Main] Failed to read dev dataset manifest.json:', manifestError?.message || manifestError);
            }
            let report: any = null;
            if (!logsOnlyFallback) {
                try {
                    const reportStat = await fs.promises.stat(reportPath);
                    if (reportStat.size <= MAX_DEV_DATASET_REPORT_BYTES) {
                        const reportRaw = await fs.promises.readFile(reportPath, 'utf-8');
                        report = JSON.parse(reportRaw);
                    } else {
                        console.warn(`[Main] Skipping dev dataset report.json (${reportStat.size} bytes) to avoid OOM.`);
                    }
                } catch (reportError: any) {
                    console.warn('[Main] Failed to read dev dataset report.json:', reportError?.message || reportError);
                }
            }
            let snapshot: any = null;
            if (!logsOnlyFallback) {
                try {
                    if (fs.existsSync(snapshotPath)) {
                        const snapshotRaw = await fs.promises.readFile(snapshotPath, 'utf-8');
                        snapshot = normalizeDevDatasetSnapshot(JSON.parse(snapshotRaw), app.getVersion());
                    }
                } catch (snapshotError: any) {
                    console.warn('[Main] Failed to read dev dataset snapshot.json:', snapshotError?.message || snapshotError);
                }
            }
            const logPaths = await resolveOrderedDatasetLogPaths(datasetDir, logsDir, manifest, snapshot);
            const snapshotLogIds = Array.isArray(snapshot?.state?.datasetLogIds) ? snapshot.state.datasetLogIds : null;
            const chunkSize = Math.max(1, Math.min(payload.chunkSize || 25, 200));

            void (async () => {
                for (let i = 0; i < logPaths.length; i += chunkSize) {
                    const chunkPaths = logPaths.slice(i, i + chunkSize);
                    const logs = await readJsonFilesWithLimit(chunkPaths, 1);
                    const slimLogs = logs.map((entry: any, offset: number) => {
                        const details = entry?.details ?? entry ?? {};
                        const absoluteIndex = i + offset;
                        const snapshotId = snapshotLogIds && typeof snapshotLogIds[absoluteIndex] === 'string'
                            ? snapshotLogIds[absoluteIndex]
                            : null;
                        return {
                            id: snapshotId || entry?.id || details?.id || `dev-log-${absoluteIndex + 1}`,
                            filePath: chunkPaths[offset],
                            status: 'calculating',
                            detailsAvailable: true,
                            fightName: details?.fightName || entry?.fightName,
                            encounterDuration: details?.encounterDuration || entry?.encounterDuration,
                            uploadTime: resolveDetailsUploadTime(details, entry)
                        };
                    });
                    event.sender.send('dev-dataset-logs-chunk', {
                        id,
                        logs: slimLogs,
                        index: i,
                        total: logPaths.length,
                        done: i + chunkSize >= logPaths.length
                    });
                }
            })();

            return { success: true, dataset: { ...meta, report, manifest, snapshot }, totalLogs: logPaths.length, integrity, logsOnlyFallback };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load dataset.' };
        }
    });

    ipcMain.handle('delete-dev-dataset', async (_event, payload: { id: string }) => {
        try {
            const dir = await ensureDevDatasetsDir();
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            const id = sanitizeDevDatasetId(payload.id);
            if (!id) return { success: false, error: 'Invalid dataset id.' };
            const folders = entries.filter((entry) =>
                entry.isDirectory() && (
                    entry.name.startsWith(`${id}-`) ||
                    entry.name.startsWith(`${DEV_DATASET_TEMP_PREFIX}${id}-`)
                )
            );
            if (folders.length === 0) return { success: false, error: 'Dataset not found.' };
            await Promise.all(folders.map((folder) => fs.promises.rm(path.join(dir, folder.name), { recursive: true, force: true })));
            devDatasetFolderCache.delete(id);
            devDatasetFinalFolderCache.delete(id);
            devDatasetManifestCache.delete(id);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to delete dataset.' };
        }
    });
}
