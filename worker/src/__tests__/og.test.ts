import { describe, expect, it } from 'vitest';
import { renderPointerHtml } from '../og';
import type { PointerRecord } from '../pointer';

const base: PointerRecord = {
    v: 1,
    loc: 'https://cdn.example.com/a.br',
    stage: 'full',
    sum: { f: 'Detonator', m: 'Eternal Battlegrounds', d: 182000, t: 1758240000000, sq: 42, en: 51 },
    created: 1758240000000,
    seen: 1758240000000,
    owner: 'darkharasho'
};

const render = (record: PointerRecord) =>
    renderPointerHtml(record, { code: 'k3Xm9qR2', viewerUrl: 'https://bridge.axi.link/view' });

describe('renderPointerHtml', () => {
    it('puts the fight name in the og:title', () => {
        expect(render(base)).toContain('<meta property="og:title" content="Detonator');
    });

    it('describes squad, enemies, map and duration', () => {
        const html = render(base);
        expect(html).toContain('42 squad');
        expect(html).toContain('51 enemies');
        expect(html).toContain('Eternal Battlegrounds');
        expect(html).toContain('3:02');
    });

    it('embeds the report location for the client-side viewer', () => {
        expect(render(base)).toContain('https://cdn.example.com/a.br');
    });

    it('marks a tombstone as expired and omits the report location', () => {
        const html = render({ ...base, stage: 'tombstone' });
        expect(html).toContain('no longer stored');
        expect(html).not.toContain('https://cdn.example.com/a.br');
    });

    it('notes that a demoted report has no replay', () => {
        expect(render({ ...base, stage: 'demoted' })).toContain('without map replay');
    });

    it('escapes HTML metacharacters in the fight name', () => {
        const html = render({ ...base, sum: { ...base.sum, f: 'Ranger "<Zerg>" & Co' } });
        expect(html).toContain('&quot;');
        expect(html).toContain('&lt;Zerg&gt;');
        expect(html).toContain('&amp;');
        expect(html).not.toContain('<Zerg>');
    });

    it('neutralises a script-closing sequence in the report location', () => {
        const html = render({ ...base, loc: 'https://x.test/a.br</script><script>alert(1)</script>' });
        expect(html).not.toContain('</script><script>');
        expect(html).toContain('\\u003c');
    });

    it('keeps the escaped boot payload parseable as JSON', () => {
        const html = render({ ...base, loc: 'https://x.test/a.br</script>' });
        const body = /<script id="axibridge-share" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1];
        expect(JSON.parse(body).loc).toBe('https://x.test/a.br</script>');
    });
});
