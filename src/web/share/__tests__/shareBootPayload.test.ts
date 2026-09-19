import { describe, expect, it } from 'vitest';
import { parseShareBootPayload, ShareBootPayloadError } from '../shareBootPayload';

describe('parseShareBootPayload', () => {
    it('parses a valid full-stage payload, keeping both loc and stage', () => {
        const result = parseShareBootPayload('{"loc":"https://example.com/shares/demo.json.br","stage":"full"}');
        // A naive impl that destructures only `loc` out of the parsed object
        // (e.g. `return { loc: parsed.loc }`) would drop `stage`, and callers
        // that branch on `stage === 'demoted'` would silently fall through to
        // the wrong (full) rendering path. `undefined` is the wrong value a
        // dropped field would produce here.
        expect(result).toEqual({ loc: 'https://example.com/shares/demo.json.br', stage: 'full' });
    });

    it('treats the literal "null" text as a tombstone, not a crash', () => {
        // JSON.parse('null') is JS `null`. A naive impl that validates
        // required fields before checking for the tombstone case (e.g.
        // `if (!parsed.loc) throw ...`) would throw a TypeError reading
        // `.loc` off `null` instead of returning `null` cleanly.
        expect(parseShareBootPayload('null')).toBeNull();
    });

    it('throws a distinct, catchable error when the script element is missing', () => {
        // A naive impl might conflate "no element found" with "tombstone"
        // (both could look like an absence of data) and return `null` here.
        // That would render the tombstone card ("this report is gone")
        // instead of a "this link is broken" error — the wrong message for
        // a completely different failure. Assert it throws instead of
        // returning null.
        expect(() => parseShareBootPayload(null)).toThrow(ShareBootPayloadError);
    });

    it('throws on malformed JSON instead of letting a raw SyntaxError escape', () => {
        // A naive impl calling `JSON.parse` with no try/catch lets the raw
        // `SyntaxError: Unexpected token ...` propagate. That's an
        // uncontrolled error type the caller can't reliably catch-and-brand
        // as a share failure, and its message ("Unexpected token u in JSON
        // at position 0") is meaningless to an end user. Assert the specific
        // wrapper type.
        expect(() => parseShareBootPayload('{not json')).toThrow(ShareBootPayloadError);
    });

    it('throws when the payload object is missing required fields', () => {
        // A naive impl that only checks `typeof parsed === 'object'` without
        // validating `loc`/`stage` would accept `{}` and return it as-is,
        // and a later `fetch(payload.loc)` would call `fetch(undefined)`
        // instead of failing fast with a clear message here.
        expect(() => parseShareBootPayload('{"stage":"full"}')).toThrow(ShareBootPayloadError);
    });
});
