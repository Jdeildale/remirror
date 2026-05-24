// Minimal Electron stub for vitest (Node environment, no Electron runtime).
export const app = {
  getPath: (_name: string) => '/tmp/remirror-test',
  quit: () => {},
  requestSingleInstanceLock: () => true,
  setAppUserModelId: () => {},
  whenReady: () => Promise.resolve(),
  on: () => {},
};

export const ipcMain = {
  on: () => {},
  handle: () => {},
  removeHandler: () => {},
};

export const BrowserWindow = class {
  loadURL() {}
  loadFile() {}
  on() {}
  webContents = { send: () => {} };
};

export default { app, ipcMain, BrowserWindow };
