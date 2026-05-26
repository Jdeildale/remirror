import Store from 'electron-store';
import { DEFAULT_WORK_HOURS, type WorkHoursConfig } from './capture/work-hours';

type Prefs = {
  hotkey: string;
  licenseKey?: string;
  capturePausedByUser: boolean;
  workHours: WorkHoursConfig;
  google: {
    refreshToken?: string;
    calendarId: string;
    syncedAt?: number;
  };
  weeklyGoal?: {
    text: string;
    projectLabel?: string;
    setAt: number;
  };
};

export const store = new Store<Prefs>({
  defaults: {
    hotkey: 'Alt+Shift+R',
    licenseKey: undefined,
    capturePausedByUser: false,
    workHours: DEFAULT_WORK_HOURS,
    google: {
      calendarId: 'primary',
    },
  },
});
