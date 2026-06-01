import type { RemirrorAPI } from '@shared/ipc-contract';

declare global {
  interface Window {
    remirror: RemirrorAPI;
  }
}

export function useRemirror(): RemirrorAPI {
  const api = window.remirror;
  if (!api) {
    throw new Error(
      'Preload not loaded — Remirror IPC unavailable. Reload the window or check the console for preload errors.',
    );
  }
  return api;
}
