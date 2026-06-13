#!/usr/bin/env node
/**
 * Conditions consistency audit.
 *
 * Validates that outgoing non-damaging condition data is internally consistent:
 * 1. Every non-damaging condition that has ANY outgoing data also has at least
 *    one player with buff-state tracking (uptimeMs > 0).
 * 2. If a player has applicationsFromBuffs > 0 for a condition, they must also
 *    have uptimeMs > 0 (both come from statesPerSource — can't have applications
 *    without duration).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

// ESM has no implicit `require`; the sandbox loader falls back to it to resolve
// node_modules packages (the src/shared/*Metrics.ts re-export shims now point at
// @axiapps/bridge-metrics). Without this, loading those shims throws.
const require = createRequire(import.meta.url);

const cwd = process.cwd();
const args = process.argv.slice(2);
const listFlagIndex = args.indexOf('--list');
const dirFlagIndex = args.indexOf('--dir');
const jsonFlag = args.includes('--json');
const modeFlagIndex = args.indexOf('--mode');
const mode = modeFlagIndex >= 0 ? args[modeFlagIndex + 1] : 'ei';

const resolveInputs = () => {
    if (listFlagIndex >= 0 && args[listFlagIndex + 1]) {
        const listPath = args[listFlagIndex + 1];
        const lines = fs.readFileSync(listPath, 'utf8')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        return lines;
    }
    if (dirFlagIndex >= 0 && args[dirFlagIndex + 1]) {
        const dir = args[dirFlagIndex + 1];
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter((name) => name.endsWith('.json'))
            .map((name) => path.join(dir, name));
    }
    const fallbackDir = mode === 'hosted' ? 'test-fixtures/boon' : 'test-fixtures/boon-ei';
    if (!fs.existsSync(path.join(cwd, fallbackDir))) return [];
    return fs.readdirSync(path.join(cwd, fallbackDir))
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(fallbackDir, name));
};

const moduleCache = new Map();
const resolveModulePath = (fromDir, req) => {
    const base = path.resolve(fromDir, req);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
};

const loadTsModule = (filePath) => {
    const absPath = path.resolve(filePath);
    if (moduleCache.has(absPath)) {
        return moduleCache.get(absPath).exports;
    }
    const source = fs.readFileSync(absPath, 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const module = { exports: {} };
    const sandboxRequire = (req) => {
        if (req.startsWith('.')) {
            const resolved = resolveModulePath(path.dirname(absPath), req);
            if (!resolved) return {};
            return loadTsModule(resolved);
        }
        return require(req);
    };
    const context = {
        exports: module.exports,
        module,
        require: sandboxRequire,
        console,
    };
    vm.runInNewContext(js, context, { filename: absPath });
    moduleCache.set(absPath, module);
    return module.exports;
};

const computeStatsSync = loadTsModule(path.join(cwd, 'src/renderer/stats/incrementalAggregation.ts')).computeStatsSync;
const statsMetrics = loadTsModule(path.join(cwd, 'src/renderer/stats/statsMetrics.ts'));
const conditionsMetrics = loadTsModule(path.join(cwd, 'src/shared/conditionsMetrics.ts'));
const NON_DAMAGING = statsMetrics.NON_DAMAGING_CONDITIONS || new Set();
const normalizeConditionLabel = conditionsMetrics.normalizeConditionLabel || ((name) => name);

const statsViewSettings = {
    showTopStats: true,
    showMvp: true,
    roundCountStats: false,
    topStatsMode: 'total',
    topSkillDamageSource: 'target',
    topSkillsMetric: 'damage'
};
const mvpWeights = {
    downContribution: 1,
    healing: 1,
    cleanses: 1,
    strips: 1,
    stability: 1,
    cc: 0.7,
    revives: 0.7,
    distanceToTag: 0.7,
    participation: 0.7,
    dodging: 0.4,
    dps: 0.2,
    damage: 0.2
};

const inputs = resolveInputs();
if (inputs.length === 0) {
    console.error('No input JSON files found. Use --dir <folder> or --list <file> or place fixtures in test-fixtures/boon-ei.');
    process.exit(1);
}

const logs = inputs.map((filePath) => {
    const abs = path.resolve(cwd, filePath);
    if (!fs.existsSync(abs)) return null;
    const details = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return { filePath, status: 'success', details };
}).filter(Boolean);

const aggregation = computeStatsSync({ logs, statsViewSettings, mvpWeights, disruptionMethod: 'count' });
const result = aggregation?.stats || aggregation || {};

const mismatches = [];
for (const cond of NON_DAMAGING) {
    const name = String(cond);

    const playerData = (result.outgoingConditionPlayers || []).map((p) => {
        const condition = p?.conditions?.[name] || p?.conditions?.[name.toLowerCase()];
        if (!condition) return null;
        const apps = Number(condition.applications || 0);
        const fromBuffs = Number(condition.applicationsFromBuffs || 0);
        const uptimeMs = Number(condition.uptimeMs || 0);
        if (apps === 0 && fromBuffs === 0 && uptimeMs === 0) return null;
        return { account: p.account, apps, fromBuffs, uptimeMs };
    }).filter(Boolean);

    if (playerData.length === 0) continue;

    // Check 1: At least one player should have buff-state tracking (uptimeMs > 0)
    const hasAnyUptime = playerData.some((p) => p.uptimeMs > 0);
    if (!hasAnyUptime) {
        mismatches.push({
            condition: name,
            issue: 'no_uptime_data',
            detail: `${playerData.length} players have application data but none have uptimeMs`
        });
        continue;
    }

    // Check 2: If applicationsFromBuffs > 0, uptimeMs should also be > 0
    // (both derive from statesPerSource — applications without duration is a bug)
    for (const p of playerData) {
        if (p.fromBuffs > 0 && p.uptimeMs <= 0) {
            mismatches.push({
                condition: name,
                issue: 'applications_without_uptime',
                detail: `${p.account}: applicationsFromBuffs=${p.fromBuffs} but uptimeMs=${p.uptimeMs}`
            });
        }
    }
}

if (jsonFlag) {
    console.log(JSON.stringify({ ok: mismatches.length === 0, mismatches }, null, 2));
} else if (mismatches.length === 0) {
    console.log('No mismatches found for non-damaging conditions (outgoing data internally consistent).');
} else {
    console.log('Mismatches:');
    mismatches.forEach((m) => {
        console.log(`- ${m.condition}: [${m.issue}] ${m.detail}`);
    });
    process.exitCode = 1;
}
