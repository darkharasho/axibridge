import { describe, expect, it } from 'vitest';
import { buildRepoOptions } from '../FightReportHistoryView';

const s = (owner: string, repo: string) => ({ owner, repo, addedVia: 'manual', addedAt: '' });

describe('History repo options', () => {
    it('lists the default first with its stored URL, then every saved site', () => {
        const opts = buildRepoOptions({
            githubRepoOwner: 'guild', githubRepoName: 'site', githubPagesBaseUrl: 'https://reports.example/',
            githubSites: [s('x', 'y'), s('Guild', 'Site')], githubFavoriteRepos: ['ignored/repo']
        });
        expect(opts).toEqual([
            { key: 'guild/site', label: 'guild/site (Default)', indexUrl: 'https://reports.example' },
            { key: 'x/y', label: 'x/y', indexUrl: 'https://x.github.io/y' }
        ]);
    });
    it('works with no default', () => {
        expect(buildRepoOptions({ githubSites: [s('x', 'y')] }).map((o) => o.key)).toEqual(['x/y']);
    });
});
