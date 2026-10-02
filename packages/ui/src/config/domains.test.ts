import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiUrl, getDisplayHost, getDomainConfig } from './domains';

function setLocation(href: string) {
  const url = new URL(href);
  vi.stubGlobal('window', { location: { origin: url.origin, host: url.host, hostname: url.hostname } });
}

describe('getDomainConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('defaults every URL to the current origin (single-origin Docker/Caddy deploy)', () => {
    setLocation('https://bunker.example.com/#overview');
    expect(getDomainConfig()).toEqual({
      landingUrl: 'https://bunker.example.com',
      dashboardUrl: 'https://bunker.example.com',
      apiUrl: 'https://bunker.example.com',
    });
  });

  it('keeps non-default ports, e.g. the standalone container on :3000', () => {
    setLocation('http://localhost:3000/');
    expect(getDomainConfig().apiUrl).toBe('http://localhost:3000');
  });

  it('does not rewrite app.* hosts to api.* anymore', () => {
    setLocation('https://app.example.com/');
    expect(getDomainConfig().apiUrl).toBe('https://app.example.com');
  });

  it('honours VITE_* overrides and strips trailing slashes', () => {
    setLocation('https://app.example.com/');
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    vi.stubEnv('VITE_DASHBOARD_URL', 'https://dash.example.com');
    vi.stubEnv('VITE_LANDING_URL', 'https://example.com//');
    expect(getDomainConfig()).toEqual({
      landingUrl: 'https://example.com',
      dashboardUrl: 'https://dash.example.com',
      apiUrl: 'https://api.example.com',
    });
  });

  it('ignores blank overrides', () => {
    setLocation('https://bunker.example.com/');
    vi.stubEnv('VITE_API_URL', '  ');
    expect(getDomainConfig().apiUrl).toBe('https://bunker.example.com');
  });
});

describe('buildApiUrl (NIP-98 signed URL)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('joins relative paths onto the API origin with exactly one slash', () => {
    setLocation('https://bunker.example.com/');
    expect(buildApiUrl('/api/v1/bunker/logs')).toBe('https://bunker.example.com/api/v1/bunker/logs');
    expect(buildApiUrl('api/v1/bunker/logs')).toBe('https://bunker.example.com/api/v1/bunker/logs');
  });

  it('preserves query strings', () => {
    setLocation('https://bunker.example.com/');
    expect(buildApiUrl('/api/v1/bunker/logs?limit=10')).toBe(
      'https://bunker.example.com/api/v1/bunker/logs?limit=10'
    );
  });

  it('passes absolute URLs through unchanged', () => {
    setLocation('https://bunker.example.com/');
    expect(buildApiUrl('https://other.example.com/x')).toBe('https://other.example.com/x');
  });

  it('uses VITE_API_URL when the API is on another host', () => {
    setLocation('https://app.example.com/');
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    expect(buildApiUrl('/api/v1/health')).toBe('https://api.example.com/api/v1/health');
  });
});

describe('getDisplayHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the host without scheme', () => {
    setLocation('https://bunker.example.com:8443/');
    expect(getDisplayHost()).toBe('bunker.example.com:8443');
  });
});
