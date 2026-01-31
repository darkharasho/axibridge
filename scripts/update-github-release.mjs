import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const releaseNotesPath = path.join(rootDir, 'RELEASE_NOTES.md');

const loadEnvFile = (filePath) => {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) return;
        const key = match[1];
        let value = match[2] ?? '';
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
};

loadEnvFile(path.join(rootDir, '.env'));

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
    console.error('GITHUB_TOKEN (or GH_TOKEN) is not set. Aborting release body update.');
    process.exit(1);
}

if (!fs.existsSync(releaseNotesPath)) {
    console.error('RELEASE_NOTES.md not found. Aborting release body update.');
    process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson?.version || '0.0.0';
const tagName = `v${version}`;
const outputDir = path.join(rootDir, packageJson?.build?.directories?.output || 'dist_out');

const publishConfig = packageJson?.build?.publish || {};
const owner = publishConfig.owner;
const repo = publishConfig.repo;
if (!owner || !repo) {
    console.error('Missing GitHub owner/repo in package.json build.publish.');
    process.exit(1);
}

const notes = fs.readFileSync(releaseNotesPath, 'utf8').trim();
if (!notes) {
    console.error('RELEASE_NOTES.md is empty. Aborting release body update.');
    process.exit(1);
}

const allowedAssetNames = new Set(['latest.yml', 'latest-linux.yml']);
const allowedAssetExts = new Set(['.AppImage', '.deb', '.exe', '.blockmap']);
const artifactName = packageJson?.build?.artifactName || '';
const artifactPrefix = artifactName
    .replace(/\$\{version\}/g, version)
    .replace(/\$\{ext\}/g, '')
    .replace(/\$\{os\}/g, '')
    .replace(/\$\{arch\}/g, '');
const shouldIncludeAsset = (fileName) => {
    if (allowedAssetNames.has(fileName)) return true;
    const ext = path.extname(fileName);
    if (!allowedAssetExts.has(ext)) return false;
    if (artifactPrefix) return fileName.startsWith(artifactPrefix);
    return true;
};

const collectReleaseFiles = (dir) => {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const absPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectReleaseFiles(absPath));
            continue;
        }
        if (!entry.isFile()) continue;
        if (!shouldIncludeAsset(entry.name)) continue;
        files.push({ absPath, name: entry.name });
    }
    return files;
};

const request = async (method, url, body) => {
    const resp = await fetch(url, {
        method,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (resp.status === 404) return { ok: false, status: 404, data: null };
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data };
};

const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

const findReleaseByTag = async () => {
    const releasesResp = await request('GET', `${baseUrl}/releases?per_page=100`);
    if (!releasesResp.ok || !Array.isArray(releasesResp.data)) return null;
    return releasesResp.data.find((release) => release?.tag_name === tagName) || null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let releaseResp = await request('GET', `${baseUrl}/releases/tags/${tagName}`);
let createdRelease = false;
if (releaseResp.status === 404) {
    const retryDelays = [800, 1200, 1800, 2600, 3400];
    for (const delay of retryDelays) {
        await sleep(delay);
        const existing = await findReleaseByTag();
        if (existing?.id) {
            releaseResp = { ok: true, status: 200, data: existing };
            break;
        }
    }
    if (releaseResp.status === 404) {
        releaseResp = await request('POST', `${baseUrl}/releases`, {
            tag_name: tagName,
            name: tagName,
            body: notes,
            draft: false,
            prerelease: false
        });
        createdRelease = releaseResp.ok;
    }
}

if (!releaseResp.ok || !releaseResp.data?.id) {
    console.error(`Failed to create/load release for ${tagName}.`);
    process.exit(1);
}

let releaseData = releaseResp.data;
if (!createdRelease) {
    const updateResp = await request('PATCH', `${baseUrl}/releases/${releaseResp.data.id}`, {
        body: notes,
        draft: false
    });
    if (!updateResp.ok) {
        console.error(`Failed to update release body (${updateResp.status}).`);
        process.exit(1);
    }
    releaseData = updateResp.data || releaseResp.data;
}

const releaseId = releaseData?.id;
const refreshedResp = releaseId ? await request('GET', `${baseUrl}/releases/${releaseId}`) : null;
if (refreshedResp?.ok) {
    releaseData = refreshedResp.data;
}

const files = collectReleaseFiles(outputDir);
if (files.length === 0) {
    console.error(`No release artifacts found in ${outputDir}. Aborting upload.`);
    process.exit(1);
}

const uploadUrl = releaseData?.upload_url?.replace('{?name,label}', '');
if (!uploadUrl) {
    console.error('Release upload URL missing. Aborting asset upload.');
    process.exit(1);
}

const existingAssets = Array.isArray(releaseData?.assets) ? releaseData.assets : [];
for (const file of files) {
    const existing = existingAssets.find((asset) => asset?.name === file.name);
    if (existing?.id) {
        await request('DELETE', `${baseUrl}/releases/assets/${existing.id}`);
    }
    const uploadResp = await fetch(`${uploadUrl}?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'X-GitHub-Api-Version': '2022-11-28'
        },
        body: fs.readFileSync(file.absPath)
    });
    if (!uploadResp.ok) {
        console.error(`Failed to upload ${file.name} (${uploadResp.status}).`);
        process.exit(1);
    }
}

console.log(`Published GitHub release ${tagName} with ${files.length} assets.`);
