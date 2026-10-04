import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger } from '../utils/logger.js';

describe('logger', () => {
  const originalLevel = process.env['LOG_LEVEL'];
  const spies = {
    error: vi.spyOn(console, 'error'),
    warn: vi.spyOn(console, 'warn'),
    info: vi.spyOn(console, 'info'),
    debug: vi.spyOn(console, 'debug'),
  };

  beforeEach(() => {
    for (const spy of Object.values(spies)) spy.mockReset().mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalLevel === undefined) delete process.env['LOG_LEVEL'];
    else process.env['LOG_LEVEL'] = originalLevel;
  });

  function logAll() {
    const log = createLogger('test');
    log.error('e');
    log.warn('w');
    log.info('i');
    log.debug('d');
  }

  function called() {
    return Object.entries(spies)
      .filter(([, spy]) => spy.mock.calls.length > 0)
      .map(([level]) => level);
  }

  it('defaults to info when LOG_LEVEL is unset', () => {
    delete process.env['LOG_LEVEL'];
    logAll();
    expect(called()).toEqual(['error', 'warn', 'info']);
  });

  it('only emits errors at LOG_LEVEL=error', () => {
    process.env['LOG_LEVEL'] = 'error';
    logAll();
    expect(called()).toEqual(['error']);
  });

  it('emits errors and warnings at LOG_LEVEL=warn', () => {
    process.env['LOG_LEVEL'] = 'WARN';
    logAll();
    expect(called()).toEqual(['error', 'warn']);
  });

  it('emits everything at LOG_LEVEL=debug', () => {
    process.env['LOG_LEVEL'] = 'debug';
    logAll();
    expect(called()).toEqual(['error', 'warn', 'info', 'debug']);
  });

  it('falls back to info for an unknown LOG_LEVEL', () => {
    process.env['LOG_LEVEL'] = 'verbose';
    logAll();
    expect(called()).toEqual(['error', 'warn', 'info']);
  });

  it('prefixes messages with the scope and passes extra args through', () => {
    delete process.env['LOG_LEVEL'];
    const err = new Error('boom');
    createLogger('relay').error('failed:', err);
    expect(spies.error).toHaveBeenCalledWith('[relay] failed:', err);
  });
});
