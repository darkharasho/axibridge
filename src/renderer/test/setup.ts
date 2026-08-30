import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

afterEach(() => {
    cleanup();
});

// Default network stub: several components (e.g. SettingsView's WvW match
// list) fetch live endpoints unconditionally on mount. Without a stub, every
// test that mounts them makes a real network request. A plain (non-
// vi.stubGlobal) reassignment before each test guarantees a clean default
// regardless of test order; tests that need specific fetch behavior can
// still override it with vi.stubGlobal('fetch', ...) + vi.unstubAllGlobals()
// in their own afterEach — unstubAllGlobals restores to whatever was current
// when that test's stub was applied, i.e. this default, so overrides always
// win for their own test and never leak into the next one.
beforeEach(() => {
    globalThis.fetch = vi.fn().mockRejectedValue(
        new Error('fetch is stubbed in tests; call vi.stubGlobal("fetch", ...) if this test needs a response')
    );
});

const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const isResponsiveContainerSizeWarning = (args: any[]) => {
    const message = typeof args[0] === 'string' ? args[0] : '';
    return message.includes('The width(')
        && message.includes('and height(')
        && message.includes('of chart should be greater than 0');
};

beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
        if (isResponsiveContainerSizeWarning(args)) return;
        originalConsoleError(...args);
    });
    vi.spyOn(console, 'warn').mockImplementation((...args: any[]) => {
        if (isResponsiveContainerSizeWarning(args)) return;
        originalConsoleWarn(...args);
    });
});

afterAll(() => {
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
});

// Skip jsdom-specific setup in Node environment
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'electronAPI', {
        value: {
            openExternal: () => {},
            mockWebReport: () => Promise.resolve({ success: false }),
            uploadWebReport: () => Promise.resolve({ success: false })
        },
        writable: true
    });

    if (!window.matchMedia) {
        window.matchMedia = () => ({
            matches: false,
            media: '',
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false
        });
    }

    // jsdom has no layout engine, so ResizeObserver never fires on real size
    // changes. Components that read a live container width (e.g. ReplayView's
    // responsive HUD collapse) drive it manually in tests via
    // `window.dispatchEvent(new Event('resize'))`; this stub re-invokes the
    // observer callback on that event so those tests can simulate a resize.
    // `observe()` deliberately does NOT call the callback synchronously —
    // components typically call `observe()` from inside a commit-phase
    // effect, and a synchronous callback there would call setState mid-commit
    // and break React (surfaced as failures across unrelated suites that
    // merely mount a ResizeObserver-using component). Components that need an
    // initial measurement should read it directly (e.g. via the ref) rather
    // than relying on `observe()` firing.
    class ResizeObserverMock {
        constructor(private cb: () => void) {
            window.addEventListener('resize', this.cb);
        }
        observe() {}
        unobserve() {}
        disconnect() { window.removeEventListener('resize', this.cb); }
    }

    if (!('ResizeObserver' in window)) {
        // @ts-ignore
        window.ResizeObserver = ResizeObserverMock;
    }

    if (!HTMLCanvasElement.prototype.getContext) {
        // @ts-ignore
        HTMLCanvasElement.prototype.getContext = () => null;
    }
}
