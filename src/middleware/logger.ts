import { promises as fs } from 'fs';
import path from 'path';

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const RETENTION_DAYS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

let lastCleanupDateKey = '';

const pad2 = (n: number) => n.toString().padStart(2, '0');

const getDateFileName = (date = new Date()) => {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}${month}${year}.log`;
};

const getTimestamp = (date = new Date()) => {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return '"[unserializable-meta]"';
  }
};

const cleanupOldLogs = async () => {
  const now = new Date();
  const todayKey = getDateFileName(now);
  if (lastCleanupDateKey === todayKey) {
    return;
  }
  lastCleanupDateKey = todayKey;

  await fs.mkdir(LOG_DIR, { recursive: true });
  const files = await fs.readdir(LOG_DIR);
  const expiryTime = now.getTime() - RETENTION_DAYS * DAY_MS;

  await Promise.all(
    files.map(async file => {
      if (!/^\d{8}\.log$/.test(file)) {
        return;
      }

      const filePath = path.join(LOG_DIR, file);
      const stat = await fs.stat(filePath);
      if (stat.mtime.getTime() < expiryTime) {
        await fs.unlink(filePath);
      }
    })
  );
};

const writeLog = async (level: LogLevel, message: string, meta?: unknown) => {
  const now = new Date();
  const timestamp = getTimestamp(now);
  const metaStr = meta === undefined ? '' : ` ${safeJson(meta)}`;
  const line = `[${timestamp}] [${level.toUpperCase()}] : ${message}${metaStr}\n`;
  const filePath = path.join(LOG_DIR, getDateFileName(now));

  await cleanupOldLogs();
  await fs.appendFile(filePath, line, 'utf8');

  if (process.env.NODE_ENV !== 'prod') {
    const consoleFn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleFn(line.trimEnd());
  }
};

const logger = {
  info(message: string, meta?: unknown) {
    void writeLog('info', message, meta);
  },
  error(message: string, meta?: unknown) {
    void writeLog('error', message, meta);
  },
  warn(message: string, meta?: unknown) {
    void writeLog('warn', message, meta);
  },
  debug(message: string, meta?: unknown) {
    void writeLog('debug', message, meta);
  },
};

export default logger;
