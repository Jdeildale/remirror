import type { RemirrorAPI } from '@shared/ipc-contract';

declare global {
  interface Window {
    remirror: RemirrorAPI;
  }
}

export function useRemirror(): RemirrorAPI {
  return window.remirror;
}
