import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

const cwd = process.cwd();
const args = process.argv.slice(2);
const allFlag = args.includes('--all');
const jsonFlag = args.includes('--json');
const sourceArgIndex = args.indexOf('--source');
const sourceType = sourceArgIndex >= 0 ? args[sourceArgIndex + 1] : 'hosted';
const outFlagIndex = args.indexOf('--out');
const outPath = outFlagIndex >= 0 ? args[outFlagIndex + 1] : null;
const hostedDir = args.includes('--hosted') ? args[args.indexOf('--hosted') + 1] : 'test-fixtures/boon';
const eiDir = args.includes('--ei') ? args[args.indexOf('--ei') + 1] : 'test-fixtures/boon-ei';
const expectHostedDir = args.includes('--expect-hosted')
    ? args[args.indexOf('--expect-hosted') + 1]
    : 'test-fixtures/conditions/hosted';
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
    const result = computeOutgoingConditions({
        players: log.players || [],
        targets: log.targets || [],
        skillMap: log.skillMap || {},
        buffMap: log.buffMap || {}
    });

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
    if (fs.existsSync(path.resolve(cwd, hostedDir))) {
        const hostedFiles = fs.readdirSync(path.resolve(cwd, hostedDir))
            .filter((name) => name.endsWith('.json'))
            .map((name) => path.join(hostedDir, name));
        failures += runAudit(hostedFiles, 'hosted', expectHostedDir);
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
    const source = sourceType === 'ei' ? 'ei' : 'hosted';
    const expectDir = source === 'ei' ? expectEiDir : expectHostedDir;
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
