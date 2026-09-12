import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { splitIntoParts } from '../../../src/shared/chunkedGzip';

const fixture = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/report.json'));

test('CHUNK-001: a stub + parts report renders the real dashboard', async ({ page }) => {
    const payload = JSON.parse(fixture.toString('utf8'));
    const gz = gzipSync(fixture, { level: 9 });
    const sha = createHash('sha256').update(gz).digest('hex');
    // Small parts so the fixture (~2 MB → a few hundred KB gzipped) spans several files.
    const { parts, manifest } = splitIntoParts(new Uint8Array(gz), 'report.json.gz', sha, 64 * 1024);
    expect(parts.length).toBeGreaterThan(1);

    const stub = {
        meta: { ...payload.meta, title: `${payload.meta?.title ?? 'Report'} — open with AxiBridge 3.10 or newer to view` },
        stats: {},
        axibridgeParts: { ...manifest, originalTitle: payload.meta?.title }
    };
    await page.route('**/reports/chunked-report/report.json', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stub) }));
    for (const part of parts) {
        await page.route(`**/reports/chunked-report/${part.path}`, (route) =>
            route.fulfill({ status: 200, contentType: 'application/gzip', body: Buffer.from(part.data) }));
    }

    await page.goto('/web/index.html?report=chunked-report');
    await expect(page.getByRole('heading', { name: /Statistics Dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/open with AxiBridge 3\.10 or newer/)).toHaveCount(0);
});
