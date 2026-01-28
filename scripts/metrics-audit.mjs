import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

const cwd = process.cwd();
const args = process.argv.slice(2);
const allFlag = args.includes('--all');
const inputPath = !allFlag ? (args[0] || 'test-fixtures/boon/20260125-202439.json') : null;
const outFlagIndex = args.indexOf('--out');
const outPath = outFlagIndex >= 0 ? args[outFlagIndex + 1] : null;
const expectFlagIndex = args.indexOf('--expect');
let expectPath = expectFlagIndex >= 0 ? args[expectFlagIndex + 1] : null;
const jsonFlag = args.includes('--json');

const deriveExpectPath = (input) => {
    const normalized = input.replace(/\\/g, '/');
    const fileName = path.basename(normalized).replace(/\.json$/i, '.metrics.json');
    if (normalized.includes('/test-fixtures/boon/')) {
        return normalized.replace('/test-fixtures/boon/', '/test-fixtures/metrics/').replace(path.basename(normalized), fileName);
    }
    return path.join('test-fixtures/metrics', fileName);
};

const resolveExpectPath = (sourcePath) => {
    if (expectPath) return expectPath;
    return deriveExpectPath(sourcePath);
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
            if (!resolved) {
                return {};
            }
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

const metricsModule = loadTsModule(path.join(cwd, 'src/shared/combatMetrics.ts'));
const {
    applySquadStabilityGeneration,
    computeOutgoingCrowdControl,
    computeIncomingDisruptions,
    computeDownContribution,
    computeSquadBarrier,
    computeSquadHealing,
} = metricsModule;

const buildMetricsOutput = (sourcePath) => {
    const log = JSON.parse(fs.readFileSync(path.resolve(cwd, sourcePath), 'utf8'));
    if (!log || !Array.isArray(log.players)) {
        return null;
    }
    const players = log.players;

    applySquadStabilityGeneration(players, { durationMS: log.durationMS || 0, buffMap: log.buffMap || {} });

    const metrics = players.map((player) => {
        const incoming = computeIncomingDisruptions(player);
        return {
            name: player.name,
            account: player.account,
            profession: player.profession,
            group: player.group,
            notInSquad: player.notInSquad,
            outCrowdControl: computeOutgoingCrowdControl(player),
            incomingStrips: incoming.strips,
            incomingCrowdControl: incoming.cc,
            downContribution: computeDownContribution(player),
            squadBarrier: computeSquadBarrier(player),
            squadHealing: computeSquadHealing(player),
            stabGeneration: player.stabGeneration || 0,
        };
    });

    return {
        source: sourcePath,
        generatedAt: new Date().toISOString(),
        metrics,
    };
};

const writeOutput = (destPath, data) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, JSON.stringify(data, null, 2));
};

const normalizeForCompare = (data) => {
    if (!data || typeof data !== 'object') return data;
    const copy = { ...data };
    delete copy.generatedAt;
    return copy;
};

const compareWithExpected = (data, expectedFile) => {
    const expectedFullPath = path.resolve(cwd, expectedFile);
    if (!fs.existsSync(expectedFullPath)) {
        return { ok: false, reason: `expected file not found: ${expectedFile}` };
    }
    const expectedRaw = fs.readFileSync(expectedFullPath, 'utf8');
    const expected = JSON.parse(expectedRaw);
    const ok = JSON.stringify(normalizeForCompare(expected)) === JSON.stringify(normalizeForCompare(data));
    return { ok, reason: ok ? '' : 'mismatch' };
};

if (allFlag) {
    const fixturesDir = path.resolve(cwd, 'test-fixtures/boon');
    const files = fs.readdirSync(fixturesDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join('test-fixtures/boon', name));

    let failures = 0;
    for (const file of files) {
        const output = buildMetricsOutput(file);
        if (!output) {
            console.log(`metrics-audit: SKIP (${file}) - no players array`);
            continue;
        }
        const expectedFile = resolveExpectPath(file);
        if (outPath) {
            const fileName = path.basename(file).replace(/\.json$/i, '.metrics.json');
            const dest = path.join(outPath, fileName);
            writeOutput(dest, output);
        }
        const { ok, reason } = compareWithExpected(output, expectedFile);
        if (ok) {
            console.log(`metrics-audit: PASS (${file})`);
        } else {
            console.log(`metrics-audit: FAIL (${file}) ${reason ? `- ${reason}` : ''}`);
            failures += 1;
        }
    }
    if (failures) {
        process.exitCode = 1;
    }
} else if (inputPath) {
    const output = buildMetricsOutput(inputPath);
    if (!output) {
        console.log(`metrics-audit: FAIL - no players array in ${inputPath}`);
        process.exitCode = 1;
        process.exit();
    }
    const serialized = JSON.stringify(output, null, 2);

    if (outPath) {
        writeOutput(outPath, output);
    }

    const expectedFile = resolveExpectPath(inputPath);
    if (expectedFile) {
        const { ok, reason } = compareWithExpected(output, expectedFile);
        if (ok) {
            console.log('metrics-audit: PASS');
        } else {
            console.log(`metrics-audit: FAIL${reason ? ` - ${reason}` : ''}`);
            process.exitCode = 1;
        }
    } else if (!outPath) {
        if (jsonFlag) {
            process.stdout.write(serialized);
        } else {
            console.log(`metrics-audit: generated metrics for ${output.metrics.length} players`);
            console.log('metrics-audit: OK (use --json to print full output)');
        }
    } else {
        console.log(`metrics-audit: wrote ${outPath}`);
    }
}
