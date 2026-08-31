// Single import point for the fixture used by Commander metric tests.
// Update FIXTURE_FILENAME if the chosen fixture is removed.
//
// Read at runtime rather than `import`ed: a static import hands `tsc --noEmit`
// a ~38 MB structural literal to infer, which alone is enough to push
// `npm run typecheck` past its 8 GB heap.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const FIXTURE_FILENAME = '20260128-190427.json';
export const commanderTestFixture = JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/boon/${FIXTURE_FILENAME}`), 'utf8'),
) as import('../dpsReportTypes').DPSReportJSON;
