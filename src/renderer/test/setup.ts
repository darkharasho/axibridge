import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
    cleanup();
});

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
