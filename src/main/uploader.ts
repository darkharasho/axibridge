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
    private static DETAILS_JSON_URL = 'https://dps.report/getJson';
    private static BACKUP_DETAILS_JSON_URL = 'https://b.dps.report/getJson';
    private static MAX_CONCURRENT_UPLOADS = 3;
    private static MAX_CONCURRENT_DETAIL_FETCHES = 1;
    private static MAX_DETAIL_FETCH_ATTEMPTS = 4;
    private static MAX_DETAIL_FETCH_BACKOFF_MS = 5000;
    private static DETAIL_FETCH_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
    private static DETAIL_FETCH_COOLDOWN_MAP_MAX = 1000;
    private static RATE_LIMIT_COOLDOWN_MS = 60000;
    private static MAX_STANDARD_BACKOFF_MS = 15000;
    private httpsAgent = new https.Agent({ keepAlive: true });
    private uploadQueue: { filePath: string; resolve: (value: UploadResult) => void }[] = [];
    private activeUploads = 0;
    private detailFetchQueue: { permalink: string; resolve: (value: any | null) => void }[] = [];
    private activeDetailFetches = 0;
    private detailFetchInFlightByPermalink = new Map<string, Promise<any | null>>();
    private detailFetchFailureCooldownByPermalink = new Map<string, { until: number; error: string }>();
    private userToken: string | null = null;

    private static formatErrorSummary(error: any): string {
        if (!error) return 'Unknown error';
        if (typeof error === 'string') return error;
        if (typeof error?.message === 'string' && error.message.length > 0) return error.message;
        try {
            return JSON.stringify(error);
        } catch {
            return Object.prototype.toString.call(error);
        }
    }

    // Set user token for authenticated uploads
    public setUserToken(token: string | null) {
        this.userToken = token;
        console.log(`[Uploader] User token ${token ? 'set' : 'cleared'}`);
    }

    private normalizePermalinkKey(permalink: string): string {
        return String(permalink || '').split('/').filter(Boolean).pop() || '';
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
            console.error('Critical queue error:', Uploader.formatErrorSummary(err));
            task.resolve({
                id: '',
                permalink: '',
                userToken: '',
                error: Uploader.formatErrorSummary(err)
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
                    permalink: typeof data.permalink === 'string'
                        ? data.permalink.replace('https://wvw.report/', 'https://dps.report/')
                        : data.permalink,
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
        const key = this.normalizePermalinkKey(permalink);
        if (!key) {
            return { error: 'invalid-permalink' };
        }
        const now = Date.now();
        const cooldown = this.detailFetchFailureCooldownByPermalink.get(key);
        if (cooldown && cooldown.until > now) {
            return { error: cooldown.error, cooldownUntil: cooldown.until, cached: true };
        }
        const inFlight = this.detailFetchInFlightByPermalink.get(key);
        if (inFlight) {
            return inFlight;
        }
        const pending = new Promise<any | null>((resolve) => {
            this.detailFetchQueue.push({ permalink: key, resolve });
            this.processDetailFetchQueue();
        });
        this.detailFetchInFlightByPermalink.set(key, pending);
        pending.finally(() => {
            if (this.detailFetchInFlightByPermalink.get(key) === pending) {
                this.detailFetchInFlightByPermalink.delete(key);
            }
        }).catch(() => {
            // No-op; caller handles errors.
        });
        return pending;
    }

    private async processDetailFetchQueue() {
        while (this.activeDetailFetches < Uploader.MAX_CONCURRENT_DETAIL_FETCHES && this.detailFetchQueue.length > 0) {
            const task = this.detailFetchQueue.shift();
            if (!task) return;
            this.activeDetailFetches += 1;
            void this.runDetailFetchTask(task);
        }
    }

    private async runDetailFetchTask(task: { permalink: string; resolve: (value: any | null) => void }) {
        try {
            const result = await this.performFetchDetailedJson(task.permalink);
            const errorCode = String(result?.error || '');
            if (errorCode === 'incomplete-json' || errorCode === 'invalid-json' || errorCode === 'empty-json-payload') {
                this.detailFetchFailureCooldownByPermalink.set(task.permalink, {
                    until: Date.now() + Uploader.DETAIL_FETCH_FAILURE_COOLDOWN_MS,
                    error: errorCode
                });
                while (this.detailFetchFailureCooldownByPermalink.size > Uploader.DETAIL_FETCH_COOLDOWN_MAP_MAX) {
                    const oldest = this.detailFetchFailureCooldownByPermalink.keys().next().value;
                    if (!oldest) break;
                    this.detailFetchFailureCooldownByPermalink.delete(oldest);
                }
            } else if (!errorCode && this.detailFetchFailureCooldownByPermalink.has(task.permalink)) {
                this.detailFetchFailureCooldownByPermalink.delete(task.permalink);
            }
            task.resolve(result);
        } catch (error: any) {
            console.error('[Uploader] Failed to fetch detailed JSON:', Uploader.formatErrorSummary(error));
            task.resolve(null);
        } finally {
            this.activeDetailFetches = Math.max(0, this.activeDetailFetches - 1);
            this.processDetailFetchQueue();
        }
    }

    private summarizeJsonPayload(value: any): string {
        if (value === null || value === undefined) return 'empty payload';
        if (Array.isArray(value)) return `array(length=${value.length})`;
        if (typeof value === 'string') return `string(length=${value.length})`;
        if (typeof value !== 'object') return `${typeof value}`;
        const keys = Object.keys(value);
        if (keys.length <= 6) {
            return `object(keys=${keys.join(',') || '(none)'})`;
        }
        return `object(keys=${keys.slice(0, 6).join(',')}, +${keys.length - 6} more)`;
    }

    private extractJsonSnippet(raw: string): string {
        if (!raw) return '';
        const compact = raw.replace(/\s+/g, ' ').trim();
        return compact.slice(0, 240);
    }

    private getDetailFetchBackoffMs(attempt: number): number {
        return Math.min(600 * Math.pow(2, Math.max(0, attempt - 1)), Uploader.MAX_DETAIL_FETCH_BACKOFF_MS);
    }

    private getDetailedJsonUrl(id: string, attempt: number): string {
        const useBackup = attempt % 2 === 0;
        const base = useBackup ? Uploader.BACKUP_DETAILS_JSON_URL : Uploader.DETAILS_JSON_URL;
        return `${base}?permalink=${id}`;
    }

    private async performFetchDetailedJson(permalink: string): Promise<any | null> {
        // Permalinks are usually https://dps.report/xxxx-yyyy
        const id = String(permalink || '').split('/').filter(Boolean).pop() || '';
        if (!id) {
            return { error: 'invalid-permalink' };
        }

        let lastHttpStatus: number | null = null;
        let lastParseError = '';
        let sawUnexpectedEnd = false;
        for (let attempt = 1; attempt <= Uploader.MAX_DETAIL_FETCH_ATTEMPTS; attempt += 1) {
            const jsonUrl = this.getDetailedJsonUrl(id, attempt);
            try {
                console.log(`[Uploader] Fetching detailed JSON from: ${jsonUrl} for ID: ${id}`);
                const response = await axios.get(jsonUrl, {
                    httpsAgent: this.httpsAgent,
                    timeout: 240000,
                    responseType: 'text',
                    transformResponse: [(data) => data],
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    validateStatus: () => true
                });

                const status = Number(response.status || 0);
                if (status < 200 || status >= 300) {
                    lastHttpStatus = status;
                    if (attempt < Uploader.MAX_DETAIL_FETCH_ATTEMPTS) {
                        await new Promise((resolve) => setTimeout(resolve, this.getDetailFetchBackoffMs(attempt)));
                        continue;
                    }
                    return { error: 'details-http-error', statusCode: status };
                }

                const raw = typeof response.data === 'string'
                    ? response.data
                    : Buffer.isBuffer(response.data)
                        ? response.data.toString('utf8')
                        : JSON.stringify(response.data);
                if (!raw || raw.trim().length === 0) {
                    if (attempt < Uploader.MAX_DETAIL_FETCH_ATTEMPTS) {
                        await new Promise((resolve) => setTimeout(resolve, this.getDetailFetchBackoffMs(attempt)));
                        continue;
                    }
                    return { error: 'empty-json-payload' };
                }

                let parsed: any = null;
                try {
                    parsed = JSON.parse(raw);
                } catch (parseError: any) {
                    const message = String(parseError?.message || parseError || '');
                    lastParseError = message;
                    const snippet = this.extractJsonSnippet(raw);
                    const isUnexpectedEnd = /Unexpected end of JSON input/i.test(message);
                    if (isUnexpectedEnd) {
                        sawUnexpectedEnd = true;
                    }
                    console.warn(
                        `[Uploader] Failed to parse detailed JSON payload (attempt ${attempt}/${Uploader.MAX_DETAIL_FETCH_ATTEMPTS}).`,
                        message,
                        snippet ? `Snippet: ${snippet}` : ''
                    );
                    if (attempt < Uploader.MAX_DETAIL_FETCH_ATTEMPTS) {
                        await new Promise((resolve) => setTimeout(resolve, this.getDetailFetchBackoffMs(attempt)));
                        continue;
                    }
                    return { error: isUnexpectedEnd ? 'incomplete-json' : 'invalid-json', parseError: message };
                }

                if (parsed) {
                    console.log(`[Uploader] JSON fetched successfully (${this.summarizeJsonPayload(parsed)})`);
                    if (parsed.error) {
                        console.warn(`[Uploader] JSON returned error: ${parsed.error}`);
                    }
                    return parsed;
                }
                if (attempt < Uploader.MAX_DETAIL_FETCH_ATTEMPTS) {
                    await new Promise((resolve) => setTimeout(resolve, this.getDetailFetchBackoffMs(attempt)));
                    continue;
                }
                return { error: 'empty-json-payload' };
            } catch (error: any) {
                console.error('[Uploader] Failed to fetch detailed JSON:', Uploader.formatErrorSummary(error));
                const status = Number(error?.response?.status || 0);
                if (status > 0) {
                    lastHttpStatus = status;
                }
                if (error?.response) {
                    try {
                        const raw = typeof error.response.data === 'string'
                            ? error.response.data
                            : JSON.stringify(error.response.data);
                        console.error('[Uploader] Response data:', this.extractJsonSnippet(raw));
                    } catch {
                        console.error('[Uploader] Response data:', '[Unserializable]');
                    }
                }
                if (attempt < Uploader.MAX_DETAIL_FETCH_ATTEMPTS) {
                    await new Promise((resolve) => setTimeout(resolve, this.getDetailFetchBackoffMs(attempt)));
                    continue;
                }
            }
        }
        if (lastHttpStatus) {
            return { error: 'details-http-error', statusCode: lastHttpStatus };
        }
        if (lastParseError) {
            return { error: sawUnexpectedEnd ? 'incomplete-json' : 'invalid-json', parseError: lastParseError };
        }
        return null;
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
