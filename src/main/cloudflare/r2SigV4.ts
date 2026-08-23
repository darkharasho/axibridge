import https from 'node:https';
import { createHash, createHmac } from 'node:crypto';
import log from 'electron-log';

// ─── R2 SigV4 transport ───────────────────────────────────────────────────────
//
// The S3-compatible R2 endpoint, reached with a hand-rolled AWS SigV4 signature.
// This is the "manual" credential path: the user pastes an access key pair from
// the Cloudflare dashboard. Moved here verbatim from githubHandlers so the OAuth
// bearer path can sit alongside it behind a shared uploader interface, rather
// than importing back into the handler module and forming a cycle.

export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl: string;
}

export const r2SignedRequest = (
    method: string,
    config: R2Config,
    bucketRelativePath: string,
    canonicalQueryString: string,
    contentType: string,
    body: Buffer
): { hostname: string; path: string; headers: Record<string, string | number> } => {
    const region = 'auto';
    const service = 's3';
    const host = `${config.accountId}.r2.cloudflarestorage.com`;
    const requestPath = `/${config.bucketName}${bucketRelativePath}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    const bodyHash = createHash('sha256').update(body).digest('hex');

    let canonicalHeaders: string;
    let signedHeaders: string;
    if (contentType) {
        canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
        signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    } else {
        canonicalHeaders = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
        signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    }

    const canonicalRequest = [method, requestPath, canonicalQueryString, canonicalHeaders, signedHeaders, bodyHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

    const hmac = (k: Buffer | string, data: string) => createHmac('sha256', k).update(data).digest();
    const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`;

    const headers: Record<string, string | number> = {
        'Authorization': authorizationHeader,
        'x-amz-content-sha256': bodyHash,
        'x-amz-date': amzDate,
    };
    if (contentType) headers['Content-Type'] = contentType;
    if (body.length > 0) headers['Content-Length'] = body.length;

    const fullPath = canonicalQueryString ? `${requestPath}?${canonicalQueryString}` : requestPath;
    return { hostname: host, path: fullPath, headers };
};

export const r2EnsureBucketCors = async (config: R2Config, newOrigin: string): Promise<{ success: boolean; error?: string }> => {
    const emptyBody = Buffer.alloc(0);

    // 1. GET existing CORS config
    const getOpts = r2SignedRequest('GET', config, '', 'cors=', '', emptyBody);
    const existingXml = await new Promise<string | null>((resolve) => {
        const req = https.request({ method: 'GET', hostname: getOpts.hostname, path: getOpts.path, headers: getOpts.headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve((res.statusCode === 200) ? data : null));
        });
        req.on('error', () => resolve(null));
        req.end();
    });

    // 2. Parse existing AllowedOrigin values
    const existingOrigins: string[] = [];
    if (existingXml) {
        const matches = existingXml.match(/<AllowedOrigin>(.*?)<\/AllowedOrigin>/g) ?? [];
        for (const m of matches) existingOrigins.push(m.replace(/<\/?AllowedOrigin>/g, ''));
    }

    // 3. If origin (or wildcard) already present, nothing to do
    if (existingOrigins.includes(newOrigin) || existingOrigins.includes('*')) {
        log.info(`[Main] R2 CORS already includes origin ${newOrigin}, skipping update`);
        return { success: true };
    }

    // 4. Build updated XML: preserve all existing rules, append a new rule for the new origin
    const newRule = [
        '  <CORSRule>',
        `    <AllowedOrigin>${newOrigin}</AllowedOrigin>`,
        '    <AllowedMethod>GET</AllowedMethod>',
        '    <AllowedHeader>*</AllowedHeader>',
        '  </CORSRule>',
    ].join('\n');

    let updatedXml: string;
    if (existingXml && existingXml.includes('</CORSConfiguration>')) {
        updatedXml = existingXml.replace('</CORSConfiguration>', `${newRule}\n</CORSConfiguration>`);
    } else {
        updatedXml = `<?xml version="1.0" encoding="UTF-8"?>\n<CORSConfiguration>\n${newRule}\n</CORSConfiguration>`;
    }

    // 5. PUT updated config
    const putBody = Buffer.from(updatedXml, 'utf-8');
    const putOpts = r2SignedRequest('PUT', config, '', 'cors=', 'application/xml', putBody);
    return new Promise((resolve) => {
        const req = https.request({ method: 'PUT', hostname: putOpts.hostname, path: putOpts.path, headers: putOpts.headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    log.info(`[Main] R2 CORS updated — added origin ${newOrigin} to bucket ${config.bucketName}`);
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: `R2 PutBucketCors failed: HTTP ${res.statusCode} — ${data.slice(0, 200)}` });
                }
            });
        });
        req.on('error', (err: Error) => resolve({ success: false, error: `R2 CORS request error: ${err.message}` }));
        req.write(putBody);
        req.end();
    });
};

export const r2PutObject = (key: string, body: Buffer, contentType: string, config: R2Config): Promise<{ success: boolean; url?: string; error?: string }> => {
    const opts = r2SignedRequest('PUT', config, `/${key}`, '', contentType, body);
    return new Promise((resolve) => {
        const req = https.request({ method: 'PUT', hostname: opts.hostname, path: opts.path, headers: opts.headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    const publicBase = config.publicUrl.replace(/\/$/, '');
                    resolve({ success: true, url: `${publicBase}/${key}` });
                } else {
                    resolve({ success: false, error: `R2 PUT failed: HTTP ${res.statusCode} — ${data.slice(0, 200)}` });
                }
            });
        });
        req.on('error', (err: Error) => resolve({ success: false, error: `R2 request error: ${err.message}` }));
        req.write(body);
        req.end();
    });
};

export const r2DeleteObject = (key: string, config: R2Config): Promise<{ success: boolean; error?: string }> => {
    const emptyBody = Buffer.alloc(0);
    const opts = r2SignedRequest('DELETE', config, `/${key}`, '', '', emptyBody);
    return new Promise((resolve) => {
        const req = https.request({ method: 'DELETE', hostname: opts.hostname, path: opts.path, headers: opts.headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: `R2 DELETE failed: HTTP ${res.statusCode} — ${data.slice(0, 200)}` });
                }
            });
        });
        req.on('error', (err: Error) => resolve({ success: false, error: `R2 DELETE error: ${err.message}` }));
        req.end();
    });
};
