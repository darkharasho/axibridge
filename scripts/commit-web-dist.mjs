import { spawnSync } from 'node:child_process';

const run = (args) => spawnSync('git', args, { encoding: 'utf8' });

const gitCheck = run(['rev-parse', '--is-inside-work-tree']);
if (gitCheck.status !== 0) {
    console.log('commit-web-dist: not a git repository, skipping.');
    process.exit(0);
}

const status = run(['status', '--porcelain', 'dist-web']);
if (status.status !== 0 || !status.stdout.trim()) {
    console.log('commit-web-dist: no dist-web changes detected.');
    process.exit(0);
}

const name = run(['config', 'user.name']);
if (!name.stdout.trim()) {
    const actor = process.env.GITHUB_ACTOR || 'qa-build';
    run(['config', 'user.name', actor]);
}

const email = run(['config', 'user.email']);
if (!email.stdout.trim()) {
    const actor = process.env.GITHUB_ACTOR || 'qa-build';
    const fallback = process.env.GITHUB_ACTOR
        ? `${process.env.GITHUB_ACTOR}@users.noreply.github.com`
        : 'qa-build@users.noreply.github.com';
    run(['config', 'user.email', fallback]);
}

const addResult = run(['add', 'dist-web']);
if (addResult.status !== 0) {
    console.error('commit-web-dist: failed to stage dist-web.');
    process.exit(1);
}

const commitResult = run(['commit', '-m', 'Update dist-web']);
if (commitResult.status !== 0) {
    console.error('commit-web-dist: commit failed.');
    process.exit(1);
}

const pushResult = run(['push']);
if (pushResult.status !== 0) {
    console.error('commit-web-dist: push failed.');
    process.exit(1);
}

console.log('commit-web-dist: committed and pushed dist-web changes.');
