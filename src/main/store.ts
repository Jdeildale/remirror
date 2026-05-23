import Store from 'electron-store';

type Prefs = {
  hotkey: string;
  // Slot reserved for future license-key validation. Phase 1 does not check it.
  licenseKey?: string;
  capturePausedByUser: boolean;
};

export const store = new Store<Prefs>({
  defaults: {
    hotkey: 'Alt+Shift+R',
    licenseKey: undefined,
    capturePausedByUser: false,
  },
});
