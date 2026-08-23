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

    class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
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

// Provide Web Stream APIs for tests that need them (e.g., fetchSliceSidecar in jsdom).
// Note: The fetchSliceSidecar test runs in Node environment (via @vitest-environment node),
// so it has native access to these APIs. This is for other tests in jsdom that may need them.
try {
    const webStreams = require('node:stream/web');

    if (!globalThis.DecompressionStream) {
        (globalThis as any).DecompressionStream = webStreams.DecompressionStream;
    }
    if (!globalThis.ReadableStream) {
        (globalThis as any).ReadableStream = webStreams.ReadableStream;
    }
    if (!globalThis.TransformStream) {
        (globalThis as any).TransformStream = webStreams.TransformStream;
    }
    if (!globalThis.WritableStream) {
        (globalThis as any).WritableStream = webStreams.WritableStream;
    }
} catch {
    // If node:stream/web is not available, proceed without these polyfills
}
