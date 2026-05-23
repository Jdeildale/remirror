import log from 'electron-log/main.js';
import { app } from 'electron';
import path from 'path';

// Files land at %APPDATA%/Remirror/logs/main.log on Windows.
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath('userData'), 'logs', 'main.log');
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
log.initialize({ preload: true });

export default log;
