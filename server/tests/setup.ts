import { beforeEach, vi } from 'vitest';
// All external integration calls must be explicitly mocked or injected.
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Unexpected network fetch in tests'))),
  ),
);
