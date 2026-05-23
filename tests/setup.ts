import { vi } from 'vitest';

// Mock the electron module so electron-log doesn't crash in the Node test environment.
vi.mock('electron', () => ({
  default: {
    app: {
      getPath: (_name: string) => '/tmp/remirror-test',
      quit: () => {},
      requestSingleInstanceLock: () => true,
      setAppUserModelId: () => {},
      whenReady: () => Promise.resolve(),
      on: () => {},
    },
    ipcMain: {
      on: () => {},
      handle: () => {},
      removeHandler: () => {},
    },
  },
  app: {
    getPath: (_name: string) => '/tmp/remirror-test',
    quit: () => {},
    requestSingleInstanceLock: () => true,
    setAppUserModelId: () => {},
    whenReady: () => Promise.resolve(),
    on: () => {},
  },
  ipcMain: {
    on: () => {},
    handle: () => {},
    removeHandler: () => {},
  },
}));
