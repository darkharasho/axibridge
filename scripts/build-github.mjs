#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

const readArgValue = (flag) => {
    const index = args.indexOf(flag);
    if (index === -1) return null;
    return args[index + 1] || null;
};

const readBumpArg = () => {
    if (args.length === 0) return null;
    const bumpIndex = args.findIndex((arg) => arg === '--bump');
    if (bumpIndex >= 0 && args[bumpIndex + 1]) return args[bumpIndex + 1];
    const direct = args.find((arg) => allowedBumps.has(arg));
    return direct || null;
};

const allowedBumps = new Set(['patch', 'minor', 'major']);
const bumpType = readBumpArg();
const releaseOwner = readArgValue('--release-owner');
const releaseRepo = readArgValue('--release-repo');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const gitCmd = isWin ? 'git.exe' : 'git';

const run = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

const bumpVersion = (current, type) => {
    const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        throw new Error(`Unsupported version format: ${current}`);
    }
    let major = Number(match[1]);
    let minor = Number(match[2]);
    let patch = Number(match[3]);

    if (type === 'major') {
        major += 1;
        minor = 0;
        patch = 0;
    } else if (type === 'minor') {
        minor += 1;
        patch = 0;
    } else if (type === 'patch') {
        patch += 1;
    }

    return `${major}.${minor}.${patch}`;
};

const packagePath = path.resolve('package.json');
const packageRaw = fs.readFileSync(packagePath, 'utf8');
const packageJson = JSON.parse(packageRaw);

if (bumpType) {
    if (!allowedBumps.has(bumpType)) {
        console.error(`Invalid bump type: ${bumpType}. Use patch, minor, or major.`);
        process.exit(1);
    }

    const currentVersion = String(packageJson.version || '').trim();
    if (!currentVersion) {
        console.error('package.json is missing a version.');
        process.exit(1);
    }

    const nextVersion = bumpVersion(currentVersion, bumpType);
    packageJson.version = nextVersion;
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`);

    run(npmCmd, ['install']);
    run(gitCmd, ['add', 'package.json', 'package-lock.json']);
    run(gitCmd, ['commit', '-m', `chore: bump version to ${nextVersion}`]);
    run(gitCmd, ['push']);
}

run(npmCmd, ['run', 'generate:release-notes']);
run(npmCmd, ['run', 'build']);
run(process.execPath, ['scripts/commit-web-dist.mjs']);
run(process.execPath, ['scripts/run-electron-builder.mjs']);
const releaseArgs = ['scripts/update-github-release.mjs'];
if (releaseOwner) releaseArgs.push('--release-owner', releaseOwner);
if (releaseRepo) releaseArgs.push('--release-repo', releaseRepo);
run(process.execPath, releaseArgs);
