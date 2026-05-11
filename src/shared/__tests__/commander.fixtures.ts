// Single import point for the fixture used by Commander metric tests.
// Update FIXTURE_FILENAME if the chosen fixture is removed.
import fixture from '../../../test-fixtures/boon/20260128-190427.json';

export const FIXTURE_FILENAME = '20260128-190427.json';
export const commanderTestFixture = fixture as unknown as import('../dpsReportTypes').DPSReportJSON;
