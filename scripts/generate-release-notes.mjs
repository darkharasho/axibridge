import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';

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

const model = process.env.OPENAI_MODEL || 'gpt-5-nano';
const org = process.env.OPENAI_ORG;
const project = process.env.OPENAI_PROJECT;

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson?.version || '0.0.0';
const nextTag = `v${version}`;

let lastTag = '';
try {
    const tags = exec('git tag --sort=-v:refname')
        .split('\n')
        .map((tag) => tag.trim())
        .filter(Boolean);
    lastTag = tags.find((tag) => tag !== nextTag) || '';
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

let diffStat = '';
let diffPatch = '';
try {
    diffStat = exec(`git diff ${range} --stat`);
} catch {
    diffStat = '';
}
try {
    diffPatch = exec(`git diff ${range} --unified=2 --no-color`);
} catch {
    diffPatch = '';
}

const maxPatchChars = 12000;
const trimmedPatch = diffPatch.length > maxPatchChars
    ? `${diffPatch.slice(0, maxPatchChars)}\n... (diff truncated)`
    : diffPatch;

const prompt = [
    `Write friendly, non-technical release notes for the "GW2 Arc Log Uploader" app.`,
    `Version: v${version}.`,
    `Use ONLY the commit summary and diff below. Don't invent features.`,
    `Keep it short and clear for end users.`,
    `Use these markdown sections (with emojis in the headings):`,
    `## 🌟 Highlights`,
    `## 🛠️ Improvements`,
    `## 🧯 Fixes`,
    `## ⚠️ Breaking Changes`,
    `If a section has nothing, write "None."`,
    `Aim for 2-5 bullets per section. Avoid repeating the same idea. No raw commit hashes.`,
    `If something is unclear, be cautious and brief.`,
    '',
    `Commit summary since ${lastTag || 'project start'}:`,
    commitLines.length ? commitLines.map((line) => `- ${line}`).join('\n') : '- No commits found.',
    '',
    `Diff summary:`,
    diffStat || 'No diff stats found.',
    '',
    `Code changes:`,
    trimmedPatch || 'No diff found.'
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

const newSection = [
    `Version v${version} — ${dateLabel}`,
    ``,
    outputText.trim()
].join('\n');

const finalNotes = `# Release Notes\n\n${newSection.trim()}\n`;

fs.writeFileSync(releaseNotesPath, finalNotes, 'utf8');
console.log(`Release notes written to ${releaseNotesPath}`);

const shouldPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.RELEASE_NOTES_AUTO_APPROVE);
if (shouldPrompt) {
    console.log('\nPlease review the release notes before continuing.');
    console.log(`Open ${releaseNotesPath} to confirm the patch notes look good.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Approve release notes and continue? (y/N): ');
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
        console.log('Release notes not approved. Aborting build.');
        process.exit(1);
    }
}

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
