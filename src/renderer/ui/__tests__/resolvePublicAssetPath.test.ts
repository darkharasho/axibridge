import { afterEach, describe, expect, it } from 'vitest';
import { resolvePublicAssetPath, setPublicAssetBase } from '../resolvePublicAssetPath';

const setPathname = (pathname: string) => {
    window.history.replaceState({}, '', pathname);
};

describe('resolvePublicAssetPath', () => {
    afterEach(() => {
        setPublicAssetBase(null);
        setPathname('/');
    });

    describe('with no override (default)', () => {
        it('walks back two levels under /reports/', () => {
            setPathname('/reports/abc123/');
            expect(resolvePublicAssetPath('svg/commander_tag_outline.svg')).toBe(
                '../../svg/commander_tag_outline.svg'
            );
        });

        it('walks back one level under /web/web/', () => {
            setPathname('/web/web/index.html');
            expect(resolvePublicAssetPath('svg/custom-icons/mouse.svg')).toBe('../svg/custom-icons/mouse.svg');
        });

        it('falls back to BASE_URL elsewhere', () => {
            setPathname('/r/abc123');
            const base = import.meta.env.BASE_URL || './';
            const normalizedBase = base.endsWith('/') ? base : `${base}/`;
            expect(resolvePublicAssetPath('img/AxiBridge-white.png')).toBe(
                `${normalizedBase}img/AxiBridge-white.png`
            );
        });

        it('strips leading slashes from the requested path', () => {
            setPathname('/reports/abc123/');
            expect(resolvePublicAssetPath('/svg/AxiBridge.svg')).toBe('../../svg/AxiBridge.svg');
        });
    });

    describe('with an override set', () => {
        it('wins over the /reports/ branch', () => {
            setPathname('/reports/abc123/');
            setPublicAssetBase('https://example.test/view/');
            expect(resolvePublicAssetPath('svg/AxiBridge.svg')).toBe('https://example.test/view/svg/AxiBridge.svg');
        });

        it('wins over the /web/web/ branch', () => {
            setPathname('/web/web/index.html');
            setPublicAssetBase('https://example.test/view/');
            expect(resolvePublicAssetPath('svg/AxiBridge.svg')).toBe('https://example.test/view/svg/AxiBridge.svg');
        });

        it('wins over the BASE_URL fallback', () => {
            setPathname('/r/abc123');
            setPublicAssetBase('https://example.test/view/');
            expect(resolvePublicAssetPath('img/AxiBridge-white.png')).toBe(
                'https://example.test/view/img/AxiBridge-white.png'
            );
        });

        it('produces exactly one separator with or without a trailing slash', () => {
            setPathname('/r/abc123');
            setPublicAssetBase('https://example.test/view');
            expect(resolvePublicAssetPath('svg/custom-icons/gw2_boon.svg')).toBe(
                'https://example.test/view/svg/custom-icons/gw2_boon.svg'
            );
            setPublicAssetBase('https://example.test/view/');
            expect(resolvePublicAssetPath('/svg/custom-icons/gw2_boon.svg')).toBe(
                'https://example.test/view/svg/custom-icons/gw2_boon.svg'
            );
        });
    });

    describe('after resetting the override to null', () => {
        it('restores the original pathname-sniffing behaviour', () => {
            setPathname('/reports/abc123/');
            setPublicAssetBase('https://example.test/view/');
            expect(resolvePublicAssetPath('svg/AxiBridge.svg')).toBe('https://example.test/view/svg/AxiBridge.svg');
            setPublicAssetBase(null);
            expect(resolvePublicAssetPath('svg/AxiBridge.svg')).toBe('../../svg/AxiBridge.svg');
        });
    });
});
