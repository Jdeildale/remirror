import Store from 'electron-store';
import { DEFAULT_WORK_HOURS, type WorkHoursConfig } from './capture/work-hours';
import { MODEL_IDS } from './anthropic/models';

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
  anthropic: {
    apiKey?: string;  // safeStorage-encrypted base64
    model: string;    // one of MODEL_IDS values
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
    anthropic: {
      model: MODEL_IDS.sonnet,
    },
  },
});
