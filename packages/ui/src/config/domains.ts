/**
 * Domain Configuration for Bilo Bunker
 *
 * The Docker image serves the dashboard and the `/api` backend from the same
 * origin, so both default to `window.location.origin`. Set `VITE_API_URL` /
 * `VITE_DASHBOARD_URL` at build time only when they live on different origins.
 */

export interface DomainConfig {
  dashboardUrl: string;
  apiUrl: string;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function getDomainConfig(): DomainConfig {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return {
    dashboardUrl: stripTrailingSlash(import.meta.env.VITE_DASHBOARD_URL || origin),
    apiUrl: stripTrailingSlash(import.meta.env.VITE_API_URL || origin),
  };
}
