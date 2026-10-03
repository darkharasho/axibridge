#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

const readBumpArg = () => {
    const allowedBumps = new Set(['patch', 'minor', 'major']);
    const bumpIndex = args.findIndex((arg) => arg === '--bump');
    if (bumpIndex >= 0 && args[bumpIndex + 1]) return args[bumpIndex + 1];
    const direct = args.find((arg) => allowedBumps.has(arg));
    return direct || null;
};

const allowedBumps = new Set(['patch', 'minor', 'major']);
const bumpType = readBumpArg();
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

/** Like `run`, but returns the exit status instead of throwing. */
const tryRun = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options });
    return result.status ?? 1;
};

const capture = (command, commandArgs) => {
    const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
    if (result.status !== 0) return '';
    return (result.stdout || '').trim();
};

const bumpVersion = (current, type) => {
    const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        throw new Error(`Unsupported version format: ${current}`);
    }
    let major = Number(match[1]);
    let minor = Number(match[2]);
    let patch = Number(match[3]);

    if (type === 'major') { major += 1; minor = 0; patch = 0; }
    else if (type === 'minor') { minor += 1; patch = 0; }
    else if (type === 'patch') { patch += 1; }

    return `${major}.${minor}.${patch}`;
};

const packagePath = path.resolve('package.json');
const packageRaw = fs.readFileSync(packagePath, 'utf8');
const packageJson = JSON.parse(packageRaw);
const currentVersion = String(packageJson.version || '').trim();

if (!currentVersion) {
    console.error('package.json is missing a version.');
    process.exit(1);
}

const nextVersion = bumpType ? bumpVersion(currentVersion, bumpType) : currentVersion;
const tagName = `v${nextVersion}`;

try {
    // Fail before doing any work if the tag is already taken — re-running a
    // release otherwise dies halfway through, after the bump has been pushed.
    if (capture(gitCmd, ['tag', '--list', tagName])) {
        console.error(`Tag ${tagName} already exists locally. Delete it or pick another version.`);
        process.exit(1);
    }
    if (capture(gitCmd, ['ls-remote', '--tags', 'origin', tagName])) {
        console.error(`Tag ${tagName} already exists on origin. Pick another version.`);
        process.exit(1);
    }

    // Quick local validation (typecheck + lint); full test suite runs in CI
    run(npmCmd, ['run', 'validate']);

    // Bump version
    if (bumpType) {
        if (!allowedBumps.has(bumpType)) {
            console.error(`Invalid bump type: ${bumpType}. Use patch, minor, or major.`);
            process.exit(1);
        }
        packageJson.version = nextVersion;
        fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`);
        run(npmCmd, ['install']);
    }

    // Generate release notes if not skipped
    if (!skipReleaseNotes) {
        run(npmCmd, ['run', 'generate:release-notes']);
    }

    // Commit
    const filesToAdd = ['package.json', 'package-lock.json'];
    if (fs.existsSync(path.resolve('RELEASE_NOTES.md'))) {
        filesToAdd.push('RELEASE_NOTES.md');
    }
    run(gitCmd, ['add', ...filesToAdd]);

    // Sign the release commit explicitly. This repo's LOCAL config sets
    // `commit.gpgsign=false` (overriding the global `true`), so without `-S`
    // every `chore: release` commit lands unsigned — flipping the config is not
    // enough, and not what we want either: only this commit should be forced.
    //
    // Signing goes through 1Password's SSH agent, which fails with "agent
    // returned an error" while the vault is locked. That must not abort the
    // release: by this point the version bump and the regenerated notes are
    // already written to the working tree, so dying here leaves it dirty
    // halfway through. Fall back to an unsigned commit and say so loudly.
    const commitMessage = `chore: release ${tagName}`;
    if (tryRun(gitCmd, ['commit', '-S', '-m', commitMessage]) !== 0) {
        console.warn('\nCould not sign the release commit (is the 1Password vault locked?).');
        console.warn('Committing UNSIGNED so the release can proceed.\n');
        run(gitCmd, ['commit', '-m', commitMessage]);
    }

    run(gitCmd, ['push']);

    // Tag and push tag — only after the bump is committed, so the tag points at
    // a commit whose package.json actually carries `nextVersion`.
    run(gitCmd, ['tag', tagName]);

    const taggedVersion = JSON.parse(capture(gitCmd, ['show', `${tagName}:package.json`]) || '{}').version;
    if (taggedVersion !== nextVersion) {
        run(gitCmd, ['tag', '-d', tagName]);
        console.error(`Tag ${tagName} would point at package.json version ${taggedVersion}, expected ${nextVersion}. Tag removed; nothing pushed.`);
        process.exit(1);
    }

    run(gitCmd, ['push', 'origin', tagName]);

    console.log(`\nRelease ${tagName} prepared and tag pushed.`);
    console.log('GitHub Actions will now build and publish the release.');
} catch (error) {
    const exitCode = error?.exitCode ?? 1;
    process.exit(exitCode);
}
