import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDomainConfig } from './domains';

describe('getDomainConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults API and dashboard to the current origin', () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_DASHBOARD_URL', '');

    expect(getDomainConfig()).toEqual({
      apiUrl: window.location.origin,
      dashboardUrl: window.location.origin,
    });
  });

  it('uses VITE_API_URL and VITE_DASHBOARD_URL when set', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    vi.stubEnv('VITE_DASHBOARD_URL', 'https://app.example.com');

    expect(getDomainConfig()).toEqual({
      apiUrl: 'https://api.example.com',
      dashboardUrl: 'https://app.example.com',
    });
  });

  it('strips a trailing slash from overrides', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    vi.stubEnv('VITE_DASHBOARD_URL', 'https://app.example.com/');

    const config = getDomainConfig();
    expect(config.apiUrl).toBe('https://api.example.com');
    expect(config.dashboardUrl).toBe('https://app.example.com');
  });
});
