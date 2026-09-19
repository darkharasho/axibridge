import { describe, expect, it, vi } from 'vitest';
import { planAssetBaseResolution, probeAssetBasePath } from '../assetBasePath';

describe('planAssetBaseResolution', () => {
    it('performs no probe at all when an explicit assetBase is supplied', () => {
        // I6: under the share viewer the page lives at /r/<code>, so all three
        // guessed candidates 404 — `/r/<code>/reports/index.json` and
        // `/r/<code>/logo.json` do not match the Worker's route regex, `./`
        // resolves to `/r` (405), and `/` reaches a Pages root that has neither
        // file. Six guaranteed-failing fetches, two of them against the Worker,
        // on every single share view.
        const plan = planAssetBaseResolution({
            assetBase: 'https://bridge.axi.link/view/',
            basePath: '/r/k3Xm9qR2/'
        });
        expect(plan.probe).toBe(false);
        expect(plan.candidates).toEqual(['https://bridge.axi.link/view/']);
        // Crucially, the guessed candidates are gone entirely — not merely
        // reordered behind the explicit one, which would still fire the probes.
        expect(plan.candidates).not.toContain('/r/k3Xm9qR2/');
        expect(plan.candidates).not.toContain('./');
        expect(plan.candidates).not.toContain('/');
    });

    it('normalises a missing trailing slash on an explicit assetBase', () => {
        expect(planAssetBaseResolution({ assetBase: 'https://x.test/view', basePath: '/' }).candidates)
            .toEqual(['https://x.test/view/']);
    });

    it('leaves the guessed-and-probed behaviour unchanged with no assetBase', () => {
        const plan = planAssetBaseResolution({ basePath: '/reports/' });
        expect(plan.probe).toBe(true);
        expect(plan.candidates).toEqual(['/reports/', './', '/']);
    });

    it('dedupes the root basePath against the root candidate', () => {
        const plan = planAssetBaseResolution({ basePath: '/' });
        expect(plan.probe).toBe(true);
        expect(plan.candidates).toEqual(['/', './']);
    });
});

describe('probeAssetBasePath', () => {
    const ok = () => vi.fn().mockResolvedValue({ ok: true } as Response);

    it('fires no fetch at all when the plan carries an explicit assetBase', () => {
        // The property the I6 fix actually has to hold: under /r/<code> the old
        // code fired six guaranteed-failing requests on every share view, two of
        // them back into the Worker.
        const fetchImpl = ok();
        const plan = planAssetBaseResolution({
            assetBase: 'https://bridge.axi.link/view/',
            basePath: '/r/k3Xm9qR2/'
        });
        return probeAssetBasePath(plan, fetchImpl as any).then((resolved) => {
            expect(fetchImpl).not.toHaveBeenCalled();
            // null means "keep the first candidate", i.e. the explicit base.
            expect(resolved).toBeNull();
        });
    });

    it('still probes, unchanged, when no assetBase is given', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ ok: false } as Response)
            .mockResolvedValueOnce({ ok: false } as Response)
            .mockResolvedValueOnce({ ok: true } as Response);
        const plan = planAssetBaseResolution({ basePath: '/reports/abc/' });
        await expect(probeAssetBasePath(plan, fetchImpl as any)).resolves.toBe('./');
        expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
            '/reports/abc/reports/index.json',
            '/reports/abc/logo.json',
            './reports/index.json'
        ]);
    });

    it('returns null when every candidate fails, leaving the first one in place', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
        const plan = planAssetBaseResolution({ basePath: '/reports/abc/' });
        await expect(probeAssetBasePath(plan, fetchImpl as any)).resolves.toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(6);
    });
});
