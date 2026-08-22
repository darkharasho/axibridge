import { describe, it, expect } from 'vitest';
import { statsLogKey } from '../statsLogKey';

describe('statsLogKey', () => {
    it('prefers filePath', () => {
        expect(statsLogKey({ filePath: '/logs/a.zevtc', id: 'x' }, 0)).toBe('/logs/a.zevtc');
    });

    it('falls back to id when filePath is missing or empty', () => {
        expect(statsLogKey({ id: 'log-7' }, 3)).toBe('log-7');
        expect(statsLogKey({ filePath: '', id: 'log-7' }, 3)).toBe('log-7');
    });

    it('falls back to a positional key when both are missing', () => {
        expect(statsLogKey({}, 3)).toBe('idx-3');
    });

    it('uses index 0 when no index is supplied', () => {
        expect(statsLogKey({})).toBe('idx-0');
    });

    it('never returns an empty string', () => {
        expect(statsLogKey(null as any, 2)).toBe('idx-2');
    });
});
