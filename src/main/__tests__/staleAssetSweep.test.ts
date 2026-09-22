import { describe, it, expect } from 'vitest';
import { selectStaleAssetPaths } from '../handlers/githubHandlers';

/**
 * The sweep runs against a live Pages site, so the failure mode is asymmetric:
 * missing an orphan wastes space, deleting a live chunk blanks the report for
 * everyone. These cover the second case first.
 */
describe('selectStaleAssetPaths', () => {
    const published = new Set(['assets/index-NEW.js', 'assets/index-NEW.css', 'assets/statsWorker-NEW.js']);

    it('drops bundles the current dist-web no longer contains', () => {
        const tree = ['assets/index-OLD.js', 'assets/index-NEW.js', 'assets/index-NEW.css', 'assets/statsWorker-NEW.js'];
        expect(selectStaleAssetPaths(tree, published, '')).toEqual(['assets/index-OLD.js']);
    });

    it('keeps code-split chunks that index.html never references', () => {
        // The regression this guards: keying the sweep off index.html would
        // delete statsWorker, which is reached only via a dynamic import.
        const tree = ['assets/statsWorker-NEW.js', 'assets/statsWorker-OLD.js'];
        expect(selectStaleAssetPaths(tree, published, '')).toEqual(['assets/statsWorker-OLD.js']);
    });

    it('sweeps nothing when the keep-set is empty', () => {
        // A missing or half-built dist-web must not be able to blank the site.
        const tree = ['assets/index-NEW.js', 'assets/index-OLD.js'];
        expect(selectStaleAssetPaths(tree, new Set(), '')).toEqual([]);
    });

    it('leaves reports and every other directory alone', () => {
        const tree = [
            'reports/20260921-abc/report.json',
            'reports/20260921-abc/report.json.gz.000',
            'index.html',
            'img/logo.png',
            'assets/index-OLD.js'
        ];
        expect(selectStaleAssetPaths(tree, published, '')).toEqual(['assets/index-OLD.js']);
    });

    it('scopes to the configured pages subdirectory', () => {
        const scoped = new Set(['docs/assets/index-NEW.js']);
        const tree = ['docs/assets/index-OLD.js', 'docs/assets/index-NEW.js', 'assets/index-OLD.js'];
        // 'assets/index-OLD.js' lives outside docs/ and is not ours to delete.
        expect(selectStaleAssetPaths(tree, scoped, 'docs')).toEqual(['docs/assets/index-OLD.js']);
    });

    it('does not treat a sibling directory as an assets prefix match', () => {
        const tree = ['assets-backup/index-OLD.js'];
        expect(selectStaleAssetPaths(tree, published, '')).toEqual([]);
    });
});
