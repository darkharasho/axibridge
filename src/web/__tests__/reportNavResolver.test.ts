import { describe, it, expect } from 'vitest';
import { resolveSectionTarget } from '../../renderer/stats/statsTaxonomy';

describe('web report hash contract', () => {
    it('keeps historical web anchors working', () => {
        for (const [anchor, expected] of [
            ['kdr', 'overview'],
            ['report-top', 'overview'],
            ['on-tag-review', 'on-tag-review'],
            ['boon-uptime', 'boon-uptime'],
            ['squad-stats', 'squad-damage-comparison'],
        ] as const) {
            const target = resolveSectionTarget(anchor);
            expect(target?.sectionId, `anchor ${anchor}`).toBe(expected);
        }
    });
});
