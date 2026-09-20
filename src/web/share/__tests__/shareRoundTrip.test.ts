import { describe, expect, it } from 'vitest';
import { brotliCompressSync } from 'zlib';
import { compressReport } from '../../../main/shareService';
import { decodeShareBody, ShareBodyDecodeError } from '../shareBodyDecode';
import { buildShareReport } from '../buildShareReport';

/** A minimal but real native `details` block: one squad commander, one pug,
 *  one enemy target. Modeled on the `makeDetails` fixture in
 *  `buildShareReport.test.ts` — enough fields for the aggregator to ingest
 *  without throwing. */
const makeDetails = () => ({
    durationMS: 6000,
    fightName: 'Skirmish',
    players: [
        {
            account: 'Cmdr.5678',
            name: 'Glorious Leader',
            profession: 'Guardian',
            notInSquad: false,
            hasCommanderTag: true,
            dpsAll: [{ damage: 100 }],
            defenses: [{ damageTaken: 10, downCount: 0, deadCount: 0 }],
            statsAll: [{}],
        },
        {
            account: 'Pug.1111',
            name: 'Rando',
            profession: 'Necromancer',
            notInSquad: false,
            hasCommanderTag: false,
            dpsAll: [{ damage: 50 }],
            defenses: [{ damageTaken: 5, downCount: 0, deadCount: 0 }],
            statsAll: [{}],
        },
    ],
    targets: [
        { isFake: false, name: 'Enemy Warrior', profession: 'Warrior', dpsAll: [{ damage: 0 }] },
    ],
});

describe('share seam round-trip: compressReport -> decodeShareBody -> buildShareReport', () => {
    it('carries the commander name from the main process through to the viewer', async () => {
        const details = makeDetails();
        const compressed = compressReport(details);
        const text = await decodeShareBody(new Uint8Array(compressed));
        const parsed = JSON.parse(text);
        const report = buildShareReport(parsed);

        // Named assertion, not toBeTruthy()/not.toThrow(): proves the exact
        // commander name survives compress -> decode -> parse -> build intact.
        expect(report.meta.commanders).toContain('Glorious Leader');
    });

    it('is actually compressing, not passing the bytes through', () => {
        const details = { ...makeDetails(), padding: 'a'.repeat(10000) };
        const raw = Buffer.byteLength(JSON.stringify(details));
        const compressed = compressReport(details);
        expect(compressed.length).toBeLessThan(raw);
    });

    it('rejects brotli bytes, the format the viewer cannot decode', async () => {
        const details = makeDetails();
        const brotli = brotliCompressSync(Buffer.from(JSON.stringify(details), 'utf8'));
        await expect(decodeShareBody(new Uint8Array(brotli))).rejects.toThrow(ShareBodyDecodeError);
    });
});
