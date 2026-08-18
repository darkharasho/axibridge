import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { createRequire } from 'module';

// ESM has no implicit `require`; the sandbox loader falls back to it to resolve
// node_modules packages (the src/shared/*Metrics.ts re-export shims now point at
// @axiapps/bridge-metrics). Without this, loading those shims throws.
const require = createRequire(import.meta.url);

const cwd = process.cwd();
const args = process.argv.slice(2);
const allFlag = args.includes('--all');
const jsonFlag = args.includes('--json');
const sourceArgIndex = args.indexOf('--source');
const sourceType = sourceArgIndex >= 0 ? args[sourceArgIndex + 1] : 'native';
const outFlagIndex = args.indexOf('--out');
const outPath = outFlagIndex >= 0 ? args[outFlagIndex + 1] : null;
// Was `test-fixtures/boon` — hosted Elite Insights JSON pulled from
// dps.report, which carries no `details.native` and so drives this metric's
// `!native` early-return and nothing else. The natively-parsed fixtures
// (`npm run generate:fixtures:native`) are the only input that exercises it.
const nativeDir = args.includes('--native') ? args[args.indexOf('--native') + 1] : 'test-fixtures/native';
const eiDir = args.includes('--ei') ? args[args.indexOf('--ei') + 1] : 'test-fixtures/boon-ei';
const expectNativeDir = args.includes('--expect-native')
    ? args[args.indexOf('--expect-native') + 1]
    : 'test-fixtures/conditions/native';
const expectEiDir = args.includes('--expect-ei')
    ? args[args.indexOf('--expect-ei') + 1]
    : 'test-fixtures/conditions/ei';

const inputPath = !allFlag ? (args[0] || null) : null;

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

const conditionsModule = loadTsModule(path.join(cwd, 'src/shared/conditionsMetrics.ts'));
const { computeOutgoingConditions } = conditionsModule;

const normalizeForCompare = (data) => {
    if (!data || typeof data !== 'object') return data;
    const copy = { ...data };
    delete copy.generatedAt;
    return copy;
};

const buildConditionsOutput = (log, source, inputFile) => {
    // `computeOutgoingConditions` reads `details.native` and takes the whole
    // details object. It used to take a hand-assembled `{players, targets,
    // skillMap, buffMap}` bag, and this call site was not updated when
    // 8b9a864a moved it onto the native container — so every fixture computed
    // nothing and mismatched a baseline recorded before the move. Pass the log
    // through whole; there is no longer a subset to pick.
    const result = computeOutgoingConditions({ details: log });

    const summary = Object.values(result.summary || {})
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({
            name: entry.name,
            applications: entry.applications || 0,
            damage: entry.damage || 0,
            applicationsFromBuffs: entry.applicationsFromBuffs || 0
        }));

    const players = Object.entries(result.playerConditions || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, conditions]) => {
            const conditionEntries = Object.entries(conditions)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, entry]) => ({
                    name,
                    applications: entry.applications || 0,
                    damage: entry.damage || 0,
                    applicationsFromBuffs: entry.applicationsFromBuffs || 0,
                    skills: Object.values(entry.skills || {})
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((skill) => ({
                            name: skill.name,
                            hits: skill.hits || 0,
                            damage: skill.damage || 0
                        }))
                }));
            return {
                key,
                conditions: conditionEntries
            };
        });

    return {
        source,
        file: inputFile,
        generatedAt: new Date().toISOString(),
        meta: result.meta,
        summary,
        players
    };
};

const writeOutput = (destPath, data) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, JSON.stringify(data, null, 2));
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

const runAudit = (files, source, expectDir) => {
    let failures = 0;
    files.forEach((file) => {
        const absPath = path.resolve(cwd, file);
        const log = JSON.parse(fs.readFileSync(absPath, 'utf8'));
        const output = buildConditionsOutput(log, source, file);

        const baseName = path.basename(file).replace(/\.json$/i, '.conditions.json');
        const expectedFile = path.join(expectDir, baseName);

        if (outPath) {
            const destDir = path.join(outPath, source);
            writeOutput(path.join(destDir, baseName), output);
        }

        const { ok, reason } = compareWithExpected(output, expectedFile);
        if (ok) {
            console.log(`conditions-audit: PASS (${source}) ${file}`);
        } else {
            console.log(`conditions-audit: FAIL (${source}) ${file}${reason ? ` - ${reason}` : ''}`);
            failures += 1;
        }
    });
    return failures;
};

if (allFlag) {
    let failures = 0;
    if (fs.existsSync(path.resolve(cwd, nativeDir))) {
        const nativeFiles = fs.readdirSync(path.resolve(cwd, nativeDir))
            .filter((name) => name.endsWith('.json'))
            .map((name) => path.join(nativeDir, name));
        failures += runAudit(nativeFiles, 'native', expectNativeDir);
    } else {
        console.error(`conditions-audit: no fixtures at ${nativeDir} — run: npm run generate:fixtures:native`);
        process.exitCode = 1;
    }
    if (fs.existsSync(path.resolve(cwd, eiDir))) {
        const eiFiles = fs.readdirSync(path.resolve(cwd, eiDir))
            .filter((name) => name.endsWith('.json'))
            .map((name) => path.join(eiDir, name));
        failures += runAudit(eiFiles, 'ei', expectEiDir);
    }
    if (failures) {
        process.exitCode = 1;
    }
} else if (inputPath) {
    const source = sourceType === 'ei' ? 'ei' : 'native';
    const expectDir = source === 'ei' ? expectEiDir : expectNativeDir;
    const absPath = path.resolve(cwd, inputPath);
    const log = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    const output = buildConditionsOutput(log, source, inputPath);

    const baseName = path.basename(inputPath).replace(/\.json$/i, '.conditions.json');
    const expectedFile = path.join(expectDir, baseName);
    if (outPath) {
        writeOutput(path.join(outPath, baseName), output);
    }

    const { ok, reason } = compareWithExpected(output, expectedFile);
    if (ok) {
        console.log('conditions-audit: PASS');
    } else {
        console.log(`conditions-audit: FAIL${reason ? ` - ${reason}` : ''}`);
        process.exitCode = 1;
    }

    if (jsonFlag) {
        process.stdout.write(JSON.stringify(output, null, 2));
    }
}
