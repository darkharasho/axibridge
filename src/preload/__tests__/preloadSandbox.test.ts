import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { SHARE_LOG_CHANNEL, SHARE_PLAN_RETENTION_CHANNEL } from '../../shared/shareChannels';

const preloadSource = readFileSync(
    path.join(__dirname, '..', 'index.ts'),
    'utf-8'
);

describe('preload sandbox constraints', () => {
    // A sandboxed preload can only `require` Electron built-ins. Any relative
    // value import compiles to a `require('../…')` that throws "module not
    // found" at load time, which kills the whole contextBridge and leaves the
    // renderer with `window.electronAPI` undefined. `import type` is erased
    // and therefore fine.
    it('has no relative value imports', () => {
        const offenders = preloadSource
            .split('\n')
            .filter(line => /^\s*import\s/.test(line))
            .filter(line => !/^\s*import\s+type\s/.test(line))
            .filter(line => /from\s+['"]\.{1,2}\//.test(line));

        expect(offenders).toEqual([]);
    });

    // The literals inlined above are also pinned by a type annotation, but the
    // typecheck only runs in `npm run validate`; this asserts the same thing
    // where the unit suite will see it.
    it('inlines channel names that match the shared constants', () => {
        expect(preloadSource).toContain(`= '${SHARE_LOG_CHANNEL}'`);
        expect(preloadSource).toContain(`= '${SHARE_PLAN_RETENTION_CHANNEL}'`);
    });
});
