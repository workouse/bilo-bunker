/**
 * Minimal leveled logger driven by the LOG_LEVEL env var
 * (`error` | `warn` | `info` | `debug`, default `info`).
 *
 * LOG_LEVEL is read on every call so it respects values loaded by dotenv
 * and changes made in tests.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export function currentLogLevel(): LogLevel {
  const raw = (process.env['LOG_LEVEL'] ?? '').trim().toLowerCase();
  return raw in LEVELS ? (raw as LogLevel) : 'info';
}

function enabled(level: LogLevel): boolean {
  return LEVELS[level] <= LEVELS[currentLogLevel()];
}

export const logger = {
  error: (...args: unknown[]): void => {
    if (enabled('error')) console.error(...args);
  },
  warn: (...args: unknown[]): void => {
    if (enabled('warn')) console.warn(...args);
  },
  info: (...args: unknown[]): void => {
    if (enabled('info')) console.info(...args);
  },
  debug: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (enabled('debug')) console.debug(...args);
  },
};
