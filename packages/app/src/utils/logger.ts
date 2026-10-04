// Minimal leveled logger. LOG_LEVEL (error | warn | info | debug, default info)
// is read on every call so it can be changed at runtime and in tests.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
export type LogLevel = keyof typeof LEVELS;

function currentLevel(): number {
  const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  return raw in LEVELS ? LEVELS[raw as LogLevel] : LEVELS.info;
}

export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  const emit =
    (level: LogLevel, sink: (...args: unknown[]) => void) =>
    (message: unknown, ...rest: unknown[]) => {
      if (LEVELS[level] > currentLevel()) return;
      sink(`${prefix} ${String(message)}`, ...rest);
    };

  return {
    error: emit('error', console.error),
    warn: emit('warn', console.warn),
    info: emit('info', console.info),
    // eslint-disable-next-line no-console -- this module is the one sanctioned console sink
    debug: emit('debug', console.debug),
  };
}
