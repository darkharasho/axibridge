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
const skipReleaseNotes = args.includes('--skip-release-notes') || args.includes('--no-release-notes');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const gitCmd = isWin ? 'git.exe' : 'git';

const run = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options });
    if (result.status !== 0) {
        const error = new Error(`Command failed: ${command} ${commandArgs.join(' ')}`);
        error.exitCode = result.status ?? 1;
        throw error;
    }
};

const capture = (command, commandArgs) => {
    const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
    if (result.status !== 0) return '';
    return (result.stdout || '').trim();
};

const getDistWebStatus = () => {
    const result = spawnSync(gitCmd, ['status', '--porcelain', 'dist-web'], { encoding: 'utf8' });
    if (result.status !== 0) return '';
    return result.stdout || '';
};

const hasDistWebDeletion = (statusText) => {
    return statusText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .some((line) => line.slice(0, 2).includes('D'));
};

const restoreDistWebIfDeleted = () => {
    const gitCheck = spawnSync(gitCmd, ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
    if (gitCheck.status !== 0) return;
    const statusText = getDistWebStatus();
    if (!hasDistWebDeletion(statusText)) return;
    const restore = spawnSync(gitCmd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', 'dist-web'], { stdio: 'inherit' });
    if (restore.status !== 0) {
        spawnSync(gitCmd, ['checkout', '--', 'dist-web'], { stdio: 'inherit' });
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

try {
    run(npmCmd, ['run', 'validate']);
    run(npmCmd, ['run', 'ci:local']);
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

    if (!skipReleaseNotes) {
        run(npmCmd, ['run', 'generate:release-notes']);

        // generate:release-notes only writes the file; committing it is ours.
        if (capture(gitCmd, ['status', '--porcelain', 'RELEASE_NOTES.md'])) {
            run(gitCmd, ['add', 'RELEASE_NOTES.md']);
            run(gitCmd, ['commit', '-m', `Update release notes v${packageJson.version}`]);
            run(gitCmd, ['push']);
        }
    }

    // Tag here rather than inside the notes generator, so the tag always lands
    // on a commit whose package.json holds the version being released.
    const tagName = `v${packageJson.version}`;
    if (capture(gitCmd, ['tag', '--list', tagName])) {
        console.log(`Tag ${tagName} already exists. Skipping tag creation.`);
    } else {
        run(gitCmd, ['tag', tagName]);
        const taggedVersion = JSON.parse(capture(gitCmd, ['show', `${tagName}:package.json`]) || '{}').version;
        if (taggedVersion !== packageJson.version) {
            run(gitCmd, ['tag', '-d', tagName]);
            throw new Error(`Tag ${tagName} would point at package.json version ${taggedVersion}, expected ${packageJson.version}. Tag removed; nothing pushed.`);
        }
        run(gitCmd, ['push', 'origin', tagName]);
    }

    run(npmCmd, ['run', 'build']);
    run(process.execPath, ['scripts/commit-web-dist.mjs']);
    run(process.execPath, ['scripts/run-electron-builder.mjs']);
    const releaseArgs = ['scripts/update-github-release.mjs'];
    if (releaseOwner) releaseArgs.push('--release-owner', releaseOwner);
    if (releaseRepo) releaseArgs.push('--release-repo', releaseRepo);
    run(process.execPath, releaseArgs);
} catch (error) {
    restoreDistWebIfDeleted();
    const exitCode = error?.exitCode ?? 1;
    process.exit(exitCode);
}
