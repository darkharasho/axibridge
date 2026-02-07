#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

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

const computeStatsAggregation = loadTsModule(path.join(cwd, 'src/renderer/stats/computeStatsAggregation.ts')).computeStatsAggregation;
const statsMetrics = loadTsModule(path.join(cwd, 'src/renderer/stats/statsMetrics.ts'));
const NON_DAMAGING = statsMetrics.NON_DAMAGING_CONDITIONS || new Set();

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

const result = computeStatsAggregation({ logs, statsViewSettings, mvpWeights, disruptionMethod: 'count' });
const specialByName = new Map();
(result.specialTables || []).forEach((t) => {
    if (!t?.name) return;
    specialByName.set(String(t.name).toLowerCase(), t);
});

const pickTop = (rows, key) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const sorted = rows.slice().sort((a, b) => (Number(b?.[key] || 0) - Number(a?.[key] || 0)) || String(a?.account || '').localeCompare(String(b?.account || '')));
    return sorted[0] || null;
};

const mismatches = [];
for (const cond of NON_DAMAGING) {
    const name = String(cond);
    const special = specialByName.get(name.toLowerCase());
    const specialTop = special ? pickTop(special.rows || [], 'total') : null;
    const outgoingPlayers = (result.outgoingConditionPlayers || []).map((p) => {
        const condition = p?.conditions?.[name] || p?.conditions?.[name.toLowerCase()];
        const val = condition?.applicationsFromUptime
            ?? condition?.applicationsFromBuffsActive
            ?? condition?.applicationsFromBuffs
            ?? condition?.applications
            ?? 0;
        return { account: p.account, profession: p.profession, value: Number(val || 0) };
    }).filter((p) => p.value > 0);
    const outgoingTop = pickTop(outgoingPlayers, 'value');

    const specialVal = specialTop ? Number(specialTop.total || 0) : 0;
    const outgoingVal = outgoingTop ? Number(outgoingTop.value || 0) : 0;
    const samePlayer = specialTop && outgoingTop ? (specialTop.account === outgoingTop.account) : false;
    const closeVal = Math.abs(specialVal - outgoingVal) < 0.5;

    if (!specialTop && !outgoingTop) continue;
    if (!(samePlayer && closeVal)) {
        mismatches.push({
            condition: name,
            specialTop: specialTop ? { account: specialTop.account, total: specialVal } : null,
            outgoingTop: outgoingTop ? { account: outgoingTop.account, total: outgoingVal } : null,
        });
    }
}

if (jsonFlag) {
    console.log(JSON.stringify({ ok: mismatches.length === 0, mismatches }, null, 2));
} else if (mismatches.length === 0) {
    console.log('No mismatches found for non-damaging conditions (top player vs special buffs).');
} else {
    console.log('Mismatches:');
    mismatches.forEach((m) => {
        console.log(`- ${m.condition}: special=${JSON.stringify(m.specialTop)} outgoing=${JSON.stringify(m.outgoingTop)}`);
    });
    process.exitCode = 1;
}
