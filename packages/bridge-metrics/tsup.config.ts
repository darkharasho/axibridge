import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

// One entry per module so the per-subpath `@axiapps/bridge-metrics/<m>`
// imports (used by axibridge's src/shared/* shims) resolve to dist/<m>.{js,cjs}.
export default defineConfig({
    entry: {
        index: 'src/index.ts',
        dpsReportTypes: 'src/dpsReportTypes.ts',
        metricsSettings: 'src/metricsSettings.ts',
        dashboardMetrics: 'src/dashboardMetrics.ts',
        combatMetrics: 'src/combatMetrics.ts',
        conditionsMetrics: 'src/conditionsMetrics.ts',
        professionUtils: 'src/professionUtils.ts',
        computePlayerAggregation: 'src/computePlayerAggregation.ts',
        rollup: 'src/rollup.ts',
        attendance: 'src/attendance.ts',
        aggregationTypes: 'src/aggregationTypes.ts',
        roles: 'src/roles.ts',
        resUtility: 'src/resUtility.ts',
        timestampUtils: 'src/timestampUtils.ts',
        reportMetrics: 'src/reportMetrics.ts',
        statsMetrics: 'src/statsMetrics.ts',
        boonGeneration: 'src/boonGeneration.ts',
        constants: 'src/constants.ts',
        playerIdentity: 'src/playerIdentity.ts'
    },
    format: ['esm', 'cjs'],
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
    dts: true,
    clean: true,
    sourcemap: false,
    target: 'es2021',
    onSuccess: async () => {
        copyFileSync('src/metrics-methods.json', 'dist/metrics-methods.json');
    }
});
