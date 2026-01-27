import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const exec = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env }).trim();

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

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    console.error('OPENAI_API_KEY is not set. Aborting release notes generation.');
    process.exit(1);
}

const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const org = process.env.OPENAI_ORG;
const project = process.env.OPENAI_PROJECT;

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson?.version || '0.0.0';
const nextTag = `v${version}`;

let lastTag = '';
try {
    lastTag = exec('git describe --tags --abbrev=0');
} catch {
    lastTag = '';
}

const range = lastTag ? `${lastTag}..HEAD` : '';
let commits = '';
try {
    commits = exec(`git log ${range} --no-merges --pretty=format:%s`);
} catch {
    commits = '';
}

const commitLines = commits
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const prompt = [
    `You are writing friendly release notes for the "GW2 Arc Log Uploader" app.`,
    `Version: v${version}.`,
    `Use ONLY the commit summary provided below (git log ${lastTag || 'project start'}..HEAD). Do not infer or add features not explicitly listed.`,
    `Please produce concise, user-facing notes with these sections and markdown headings (include emojis in headings and sprinkle a few emojis in bullets):`,
    `## 🌟 Highlights`,
    `## 🛠️ Improvements`,
    `## 🧯 Fixes`,
    `## ⚠️ Breaking Changes`,
    `If a section has no items, write "None." under it.`,
    `Keep to 3-6 bullets per section max, avoid raw commit hashes, and translate technical phrasing into user-friendly language.`,
    `If a commit message is vague or unclear, summarize it conservatively without guessing details.`,
    '',
    `Commit summary since ${lastTag || 'project start'}:`,
    commitLines.length ? commitLines.map((line) => `- ${line}`).join('\n') : '- No commits found.'
].join('\n');

const body = {
    model,
    input: [
        {
            role: 'system',
            content: [
                { type: 'input_text', text: 'You generate polished release notes for end users.' }
            ]
        },
        {
            role: 'user',
            content: [
                { type: 'input_text', text: prompt }
            ]
        }
    ],
    text: { format: { type: 'text' } }
};

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
};
if (org) headers['OpenAI-Organization'] = org;
if (project) headers['OpenAI-Project'] = project;

const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
});

if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI API error (${response.status}): ${errorText}`);
    process.exit(1);
}

const data = await response.json();

let outputText = data.output_text;
if (!outputText && Array.isArray(data.output)) {
    const parts = [];
    for (const item of data.output) {
        if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const content of item.content) {
            if (content?.type === 'output_text' && content.text) {
                parts.push(content.text);
            }
        }
    }
    outputText = parts.join('\n').trim();
}

if (!outputText) {
    console.error('OpenAI API returned no usable output for release notes.');
    process.exit(1);
}

const dateLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
});

const finalNotes = [
    `# Release Notes`,
    ``,
    `Version v${version} — ${dateLabel}`,
    ``,
    outputText.trim(),
    ``
].join('\n');

fs.writeFileSync(releaseNotesPath, finalNotes, 'utf8');
console.log(`Release notes written to ${releaseNotesPath}`);

try {
    const status = exec('git status --porcelain');
    if (status.split('\n').some((line) => line.includes('RELEASE_NOTES.md'))) {
        exec('git add RELEASE_NOTES.md');
        exec(`git commit -m "Update release notes v${version}"`);
        exec('git push');
        console.log('Committed and pushed RELEASE_NOTES.md.');
    } else {
        console.log('RELEASE_NOTES.md unchanged. Skipping commit.');
    }
} catch (err) {
    console.error(`Failed to commit/push RELEASE_NOTES.md:`, err?.message || err);
    process.exit(1);
}

try {
    const existingTags = exec('git tag').split('\n').map((tag) => tag.trim()).filter(Boolean);
    if (existingTags.includes(nextTag)) {
        console.log(`Tag ${nextTag} already exists. Skipping tag creation.`);
    } else {
        exec(`git tag ${nextTag}`);
        exec(`git push origin ${nextTag}`);
        console.log(`Created and pushed tag ${nextTag}.`);
    }
} catch (err) {
    console.error(`Failed to create/push tag ${nextTag}:`, err?.message || err);
    process.exit(1);
}
