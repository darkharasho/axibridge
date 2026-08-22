/**
 * Base64url bitmask over fight ordinals — the whole persistence model for a
 * slice. Bit `i` set means `fights[i]` is included; bytes are little-endian by
 * ordinal, so the first fight is the low bit of the first byte.
 *
 * The first byte of the payload is the width, which is what lets a stale link
 * (a report republished with more fights) be rejected instead of silently
 * decoding into the wrong fights.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const toBase64Url = (bytes: number[]): string => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const chunk = (b0 << 16) | (b1 << 8) | b2;
        const chars = [chunk >> 18, (chunk >> 12) & 63, (chunk >> 6) & 63, chunk & 63];
        const keep = i + 2 < bytes.length ? 4 : (i + 1 < bytes.length ? 3 : 2);
        for (let c = 0; c < keep; c++) out += ALPHABET[chars[c]];
    }
    return out;
};

const fromBase64Url = (token: string): number[] | null => {
    const values: number[] = [];
    for (const ch of token) {
        const v = ALPHABET.indexOf(ch);
        if (v < 0) return null;
        values.push(v);
    }
    const bytes: number[] = [];
    for (let i = 0; i < values.length; i += 4) {
        const keep = Math.min(4, values.length - i);
        if (keep === 1) return null;
        const chunk = (values[i] << 18)
            | (values[i + 1] << 12)
            | ((keep > 2 ? values[i + 2] : 0) << 6)
            | (keep > 3 ? values[i + 3] : 0);
        bytes.push((chunk >> 16) & 255);
        if (keep > 2) bytes.push((chunk >> 8) & 255);
        if (keep > 3) bytes.push(chunk & 255);
    }
    return bytes;
};

export function encodeSliceMask(includedOrdinals: number[], width: number): string {
    const byteCount = Math.ceil(Math.max(0, width) / 8);
    const bytes = new Array(byteCount).fill(0);
    includedOrdinals.forEach((ordinal) => {
        if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= width) return;
        bytes[ordinal >> 3] |= 1 << (ordinal & 7);
    });
    return toBase64Url(bytes);
}

export function decodeSliceMask(token: string, width: number): number[] | null {
    if (!token) return null;
    const bytes = fromBase64Url(token);
    if (!bytes) return null;
    const expectedByteCount = Math.ceil(Math.max(0, width) / 8);
    if (bytes.length !== expectedByteCount) return null;
    const included: number[] = [];
    for (let ordinal = 0; ordinal < width; ordinal++) {
        if (bytes[ordinal >> 3] & (1 << (ordinal & 7))) included.push(ordinal);
    }
    return included;
}
