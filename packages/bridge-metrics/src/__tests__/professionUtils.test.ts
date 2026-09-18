import { describe, expect, it } from 'vitest';
import { getProfessionEmoji, getProfessionEmojiToken } from '../professionUtils';

describe('getProfessionEmojiToken', () => {
    it('tokenizes an elite spec by its own name, not its base profession', () => {
        expect(getProfessionEmojiToken('Firebrand')).toBe('{{spec:firebrand}}');
        expect(getProfessionEmojiToken('Bladesworn')).toBe('{{spec:bladesworn}}');
    });

    it('tokenizes a core profession by its own name', () => {
        expect(getProfessionEmojiToken('Guardian')).toBe('{{spec:guardian}}');
    });

    it('falls back to unknown for blank or missing input', () => {
        expect(getProfessionEmojiToken('')).toBe('{{spec:unknown}}');
        expect(getProfessionEmojiToken(undefined as unknown as string)).toBe('{{spec:unknown}}');
    });

    it('emits only characters the relay token grammar accepts', () => {
        const token = getProfessionEmojiToken('Holosmith');
        expect(token).toMatch(/^\{\{spec:[a-z0-9]+\}\}$/);
    });

    it('leaves the unicode renderer untouched', () => {
        expect(getProfessionEmoji('Firebrand')).toBe('🔵');
    });
});
