import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import https from 'https';

export interface UploadResult {
    id: string;
    permalink: string;
    userToken: string;
    uploadTime?: number;
    encounterDuration?: string;
    fightName?: string;
    error?: string;
    statusCode?: number;
}

export class Uploader {
    private static API_URL = 'https://dps.report/uploadContent';
    private static BACKUP_API_URL = 'https://b.dps.report/uploadContent';
    private static MAX_CONCURRENT_UPLOADS = 3;
    private static RATE_LIMIT_COOLDOWN_MS = 60000;
    private static MAX_STANDARD_BACKOFF_MS = 15000;
    private httpsAgent = new https.Agent({ keepAlive: true });
    private uploadQueue: { filePath: string; resolve: (value: UploadResult) => void }[] = [];
    private activeUploads = 0;
    private userToken: string | null = null;

    // Set user token for authenticated uploads
    public setUserToken(token: string | null) {
        this.userToken = token;
        console.log(`[Uploader] User token ${token ? 'set' : 'cleared'}`);
    }

    // Direct public method returns a promise that resolves when THIS specific file is done
    public upload(filePath: string): Promise<UploadResult> {
        return new Promise((resolve) => {
            this.uploadQueue.push({ filePath, resolve });
            this.processQueue();
        });
    }

    private async processQueue() {
        while (this.activeUploads < Uploader.MAX_CONCURRENT_UPLOADS && this.uploadQueue.length > 0) {
            const task = this.uploadQueue.shift();
            if (!task) return;
            this.activeUploads += 1;
            void this.runTask(task);
        }
    }

    private async runTask(task: { filePath: string; resolve: (value: UploadResult) => void }) {
        let result: UploadResult | undefined;
        try {
            result = await this.performUpload(task.filePath);
            task.resolve(result);
        } catch (err: any) {
            console.error("Critical queue error:", err);
            task.resolve({
                id: '',
                permalink: '',
                userToken: '',
                error: err.message || 'Unknown queue error'
            });
        } finally {
            const delay = this.getInterUploadDelayMs(result);
            if (delay >= Uploader.RATE_LIMIT_COOLDOWN_MS) {
                console.warn(`[Queue] Cooling down for ${delay}ms before next upload.`);
            }
            await new Promise(r => setTimeout(r, delay));
            this.activeUploads = Math.max(0, this.activeUploads - 1);
            this.processQueue();
        }
    }

    private async performUpload(filePath: string): Promise<UploadResult> {
        let lastError: any;
        const maxRetries = 10;

        try {
            const stats = fs.statSync(filePath);
            console.log(`[Uploader] Processing file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        } catch (e) {
            console.error(`[Uploader] Failed to get file stats:`, e);
        }

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const formData = new FormData();
                formData.append('json', '1');
                formData.append('generator', 'ei');
                formData.append('detailedwvw', 'true');

                // Include user token if available
                if (this.userToken) {
                    formData.append('userToken', this.userToken);
                }

                formData.append('file', fs.createReadStream(filePath));

                // Alternate between main and backup URL on every retry
                const url = (attempt % 2 === 0) ? Uploader.BACKUP_API_URL : Uploader.API_URL;
                console.log(`[Uploader] Uploading ${filePath} to ${url}... (Attempt ${attempt}/${maxRetries})`);

                const response = await axios.post(url, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Origin': 'https://dps.report',
                        'Referer': 'https://dps.report/'
                    },
                    httpsAgent: this.httpsAgent,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    timeout: 900000 // 15 minute timeout per request (recommended by dps.report)
                });

                const data = response.data;

                return {
                    id: data.id,
                    permalink: data.permalink,
                    userToken: data.userToken,
                    uploadTime: data.uploadTime || Math.floor(Date.now() / 1000),
                    encounterDuration: data.encounter?.duration,
                    fightName: data.encounter?.boss
                };

            } catch (error: any) {
                lastError = error;
                const statusCode = error.response?.status;
                console.error(`[Uploader] Upload attempt ${attempt} failed with status ${statusCode || 'unknown'}:`, error.message || error);

                if (attempt < maxRetries) {
                    let backoff = Math.min(1000 * Math.pow(2, attempt - 1), Uploader.MAX_STANDARD_BACKOFF_MS);
                    const retryAfterMs = this.getRetryAfterMs(error);

                    if (retryAfterMs > 0) {
                        backoff = retryAfterMs;
                    } else if (error.response && error.response.status === 429) {
                        console.warn("HIT RATE LIMIT (429). Sleeping for 60 seconds...");
                        backoff = Uploader.RATE_LIMIT_COOLDOWN_MS;
                    }

                    console.log(`Retrying in ${backoff}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoff));
                }
            }
        }

        console.error('All upload retries failed.');
        return {
            id: '',
            permalink: '',
            userToken: '',
            error: lastError?.message || 'Unknown upload error',
            statusCode: lastError?.response?.status
        };
    }

    async fetchDetailedJson(permalink: string): Promise<any | null> {
        try {
            // Permalinks are usually https://dps.report/xxxx-yyyy
            // The JSON endpoint is https://dps.report/getJson?permalink=xxxx-yyyy
            const id = permalink.split('/').pop();
            const jsonUrl = `https://dps.report/getJson?permalink=${id}`;
            console.log(`[Uploader] Fetching detailed JSON from: ${jsonUrl} for ID: ${id}`);

            const response = await axios.get(jsonUrl);
            if (response.data) {
                console.log(`[Uploader] JSON fetched successfully. Keys: ${Object.keys(response.data).join(',')}`);
                if (response.data.error) {
                    console.warn(`[Uploader] JSON returned error: ${response.data.error}`);
                }
            } else {
                console.warn('[Uploader] JSON response was empty.');
            }
            return response.data;
        } catch (error: any) {
            console.error('[Uploader] Failed to fetch detailed JSON:', error.message);
            if (error.response) {
                console.error('[Uploader] Response status:', error.response.status);
                console.error('[Uploader] Response data:', JSON.stringify(error.response.data));
            }
            return null;
        }
    }

    private getInterUploadDelayMs(result?: UploadResult): number {
        if (result?.statusCode === 429) {
            return Uploader.RATE_LIMIT_COOLDOWN_MS;
        }
        if (result?.error) {
            return this.userToken ? 500 : 1000;
        }
        // Keep slots hot on success; rely on retry/backoff when the service pushes back.
        return 0;
    }

    private getRetryAfterMs(error: any): number {
        const raw = error?.response?.headers?.['retry-after'];
        if (!raw) return 0;
        const asNumber = Number(raw);
        if (Number.isFinite(asNumber) && asNumber > 0) {
            return Math.round(asNumber * 1000);
        }
        const retryDate = Date.parse(String(raw));
        if (!Number.isNaN(retryDate)) {
            return Math.max(retryDate - Date.now(), 0);
        }
        return 0;
    }
}
