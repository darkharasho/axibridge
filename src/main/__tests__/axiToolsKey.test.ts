import { describe, expect, it } from 'vitest';
import { parseBridgeKey } from '../axiToolsKey';

const b64url = (s: string) => Buffer.from(s, 'utf-8').toString('base64url');
const validKey = `axb1.${b64url('https://bot.example.com')}.${'a'.repeat(43)}`;

describe('parseBridgeKey', () => {
    it('decodes the relay URL from the key', () => {
        expect(parseBridgeKey(validKey)).toEqual({ relayUrl: 'https://bot.example.com' });
    });

    it('accepts a loopback http URL for self-hosters', () => {
        const key = `axb1.${b64url('http://127.0.0.1:8642')}.${'a'.repeat(43)}`;
        expect(parseBridgeKey(key)).toEqual({ relayUrl: 'http://127.0.0.1:8642' });
    });

    it('rejects an axt1 guild key', () => {
        expect(parseBridgeKey(`axt1.${b64url('https://x.example')}.${'a'.repeat(43)}`)).toBeNull();
    });

    it.each([
        ['empty', ''],
        ['no prefix', 'not-a-key'],
        ['missing secret', `axb1.${b64url('https://x.example')}`],
        ['short secret', `axb1.${b64url('https://x.example')}.abc`],
        ['undecodable url', 'axb1.!!!!.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
        ['non-http url', `axb1.${b64url('ftp://x.example')}.${'a'.repeat(43)}`],
    ])('rejects %s without throwing', (_label, key) => {
        expect(parseBridgeKey(key as string)).toBeNull();
    });

    it('tolerates surrounding whitespace from a paste', () => {
        expect(parseBridgeKey(`  ${validKey}\n`)).toEqual({ relayUrl: 'https://bot.example.com' });
    });
});
