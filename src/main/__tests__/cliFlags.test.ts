import { describe, it, expect } from 'vitest';
import { parseCliFlags } from '../cliFlags';

describe('parseCliFlags', () => {
    it('detects --headless anywhere in argv', () => {
        expect(parseCliFlags(['electron', '.', '--headless']).headless).toBe(true);
        expect(parseCliFlags(['/usr/bin/AxiBridge', '--headless', '--foo']).headless).toBe(true);
    });
    it('defaults to windowed', () => {
        expect(parseCliFlags(['electron', '.']).headless).toBe(false);
    });
});
