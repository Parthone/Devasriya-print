import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy* queries default to a 1s budget, which is not enough once a session
// restore, a profile read and a route redirect all have to settle on a busy
// machine. Five seconds removes the flakiness without hiding real hangs.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});

// Radix primitives use pointer capture and scrollIntoView, neither of which
// jsdom implements. Without these the select and dropdown menus cannot open in
// tests.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

// jsdom does not implement matchMedia; the theme provider relies on it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
