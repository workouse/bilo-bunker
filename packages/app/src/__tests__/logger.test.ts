import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLogLevel, logger } from '../utils/logger.js';

describe('logger', () => {
  const original = process.env['LOG_LEVEL'];

  afterEach(() => {
    if (original === undefined) delete process.env['LOG_LEVEL'];
    else process.env['LOG_LEVEL'] = original;
    vi.restoreAllMocks();
  });

  it('defaults to info when LOG_LEVEL is unset or invalid', () => {
    delete process.env['LOG_LEVEL'];
    expect(currentLogLevel()).toBe('info');
    process.env['LOG_LEVEL'] = 'verbose';
    expect(currentLogLevel()).toBe('info');
  });

  it('is case-insensitive', () => {
    process.env['LOG_LEVEL'] = ' DEBUG ';
    expect(currentLogLevel()).toBe('debug');
  });

  it('suppresses messages below the configured level', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    process.env['LOG_LEVEL'] = 'warn';
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('w');
    expect(error).toHaveBeenCalledWith('e');
  });

  it('emits debug messages when LOG_LEVEL=debug', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    process.env['LOG_LEVEL'] = 'debug';
    logger.debug('d');
    expect(debug).toHaveBeenCalledWith('d');
  });
});
