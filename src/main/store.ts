import Store from 'electron-store';
import { DEFAULT_WORK_HOURS, type WorkHoursConfig } from './capture/work-hours';

type Prefs = {
  hotkey: string;
  // Slot reserved for future license-key validation. Phase 1 does not check it.
  licenseKey?: string;
  capturePausedByUser: boolean;
  workHours: WorkHoursConfig;
};

export const store = new Store<Prefs>({
  defaults: {
    hotkey: 'Alt+Shift+R',
    licenseKey: undefined,
    capturePausedByUser: false,
    workHours: DEFAULT_WORK_HOURS,
  },
});
