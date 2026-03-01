#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2).filter(Boolean);
if (args.length === 0) {
    console.error('Usage: node scripts/obfuscate-accounts.mjs <json-file> [more-json-files]');
    process.exit(1);
}

const ACCOUNT_PATTERN = /^[A-Za-z][A-Za-z0-9 _'-]{1,31}\.\d{4}$/;

const ADJECTIVES = [
    'Amber', 'Arctic', 'Ashen', 'Bold', 'Brisk', 'Bright', 'Calm', 'Cinder', 'Cloud', 'Crimson',
    'Daring', 'Dusky', 'Echo', 'Ember', 'Fable', 'Feral', 'Frost', 'Gilded', 'Grand', 'Harbor',
    'Hidden', 'Iron', 'Ivory', 'Jade', 'Keen', 'Lively', 'Lunar', 'Merry', 'Misty', 'Nimble',
    'Nova', 'Oak', 'Onyx', 'Placid', 'Prime', 'Quick', 'Quiet', 'Raven', 'Royal', 'Rustic',
    'Sable', 'Scarlet', 'Shaded', 'Silver', 'Solar', 'Stone', 'Storm', 'Swift', 'Umber', 'Velvet',
    'Verdant', 'Vivid', 'Wild', 'Winter', 'Wise', 'Woven', 'Young', 'Zephyr'
];

const NOUNS = [
    'Arrow', 'Beacon', 'Bloom', 'Brook', 'Canyon', 'Cedar', 'Cipher', 'Comet', 'Creek', 'Crest',
    'Dawn', 'Drift', 'Ember', 'Falcon', 'Field', 'Flare', 'Forest', 'Forge', 'Garden', 'Glen',
    'Grove', 'Harbor', 'Haven', 'Hollow', 'Horizon', 'Jet', 'Journey', 'Keeper', 'Lagoon', 'Lane',
    'Laurel', 'Leaf', 'Light', 'Meadow', 'Mesa', 'Morrow', 'North', 'Oak', 'Pine', 'Quill',
    'Range', 'Ridge', 'River', 'Rune', 'Sage', 'Shore', 'Sky', 'Song', 'Spark', 'Spruce',
    'Star', 'Summit', 'Thorn', 'Vale', 'Vista', 'Wave', 'Willow', 'Wisp'
];

const obfuscatedByOriginal = new Map();

const buildFakeAccount = (original) => {
    if (obfuscatedByOriginal.has(original)) {
        return obfuscatedByOriginal.get(original);
    }

    const digest = crypto.createHash('sha256').update(original).digest();
    const left = digest.readUInt16BE(0);
    const right = digest.readUInt16BE(2);
    const num = digest.readUInt16BE(4);
    const adjective = ADJECTIVES[left % ADJECTIVES.length];
    const noun = NOUNS[right % NOUNS.length];
    const suffix = String((num % 9000) + 1000).padStart(4, '0');
    const fake = `${adjective}${noun}.${suffix}`;
    obfuscatedByOriginal.set(original, fake);
    return fake;
};

const transform = (value) => {
    if (Array.isArray(value)) {
        return value.map(transform);
    }
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            value[key] = transform(value[key]);
        }
        return value;
    }
    if (typeof value === 'string' && ACCOUNT_PATTERN.test(value)) {
        return buildFakeAccount(value);
    }
    return value;
};

for (const fileArg of args) {
    const filePath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(filePath)) {
        console.error(`Skipping missing file: ${fileArg}`);
        continue;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.error(`Skipping invalid JSON: ${fileArg} (${error?.message || error})`);
        continue;
    }
    const transformed = transform(parsed);
    fs.writeFileSync(filePath, JSON.stringify(transformed), 'utf8');
    console.log(`Obfuscated account names in ${fileArg}`);
}
