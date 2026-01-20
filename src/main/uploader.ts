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
    private httpsAgent = new https.Agent({ keepAlive: true });
    private uploadQueue: { filePath: string; resolve: (value: UploadResult) => void }[] = [];
    private isUploading = false;

    // Direct public method returns a promise that resolves when THIS specific file is done
    public upload(filePath: string): Promise<UploadResult> {
        return new Promise((resolve) => {
            this.uploadQueue.push({ filePath, resolve });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isUploading || this.uploadQueue.length === 0) return;

        this.isUploading = true;
        const task = this.uploadQueue.shift();

        if (task) {
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
                // Adaptive Throttling
                // If we hit a 429, wait significantly longer (60s) to let the rate limit bucket reset.
                // Otherwise, wait 15s to be extremely safe for anonymous uploads by default.
                let delay = 15000;

                if (result && result.statusCode === 429) {
                    console.warn("[Queue] Hit Rate Limit (429) in result. Pausing queue for 60 seconds...");
                    delay = 60000;
                }

                await new Promise(r => setTimeout(r, delay));
                this.isUploading = false;
                this.processQueue();
            }
        } else {
            this.isUploading = false;
        }
    }

    private async performUpload(filePath: string): Promise<UploadResult> {
        let lastError: any;
        const maxRetries = 10; // Increase retries significantly

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const formData = new FormData();
                formData.append('json', '1');
                formData.append('generator', 'ei');
                formData.append('detailedwvw', 'true');
                formData.append('file', fs.createReadStream(filePath));

                // Toggle between main and backup URL after 2 failures
                const url = (attempt > 2 && attempt % 2 !== 0) ? Uploader.BACKUP_API_URL : Uploader.API_URL;
                console.log(`Uploading ${filePath} to ${url}... (Attempt ${attempt}/${maxRetries})`);

                const response = await axios.post(url, formData, {
                    headers: {
                        ...formData.getHeaders(),
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
                console.error(`Upload attempt ${attempt} failed:`, error.message || error);

                if (attempt < maxRetries) {
                    let backoff = 1000 * Math.pow(2, attempt - 1);

                    if (error.response && error.response.status === 429) {
                        console.warn("HIT RATE LIMIT (429). Sleeping for 60 seconds...");
                        backoff = 60000; // Force 60s wait
                    } else if (backoff > 30000) {
                        backoff = 30000; // Cap normal exponential backoff to 30s
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
}
