/**
 * Domain Configuration for Bilo Bunker
 *
 * The Docker image (and the Caddy stack) serves the dashboard and the API from
 * the same origin, so everything defaults to `window.location.origin`.
 * Deployments that split them across hosts can override at build time with
 * VITE_API_URL / VITE_DASHBOARD_URL / VITE_LANDING_URL.
 */

export interface DomainConfig {
  landingUrl: string;
  dashboardUrl: string;
  apiUrl: string;
}

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export function getDomainConfig(): DomainConfig {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const resolve = (override: string | undefined): string =>
    stripTrailingSlash(override?.trim() || origin);

  return {
    landingUrl: resolve(import.meta.env.VITE_LANDING_URL),
    dashboardUrl: resolve(import.meta.env.VITE_DASHBOARD_URL),
    apiUrl: resolve(import.meta.env.VITE_API_URL),
  };
}

/** Host (no scheme) of the dashboard, for display in badges, e.g. `bunker.example.com`. */
export function getDisplayHost(): string {
  const { dashboardUrl } = getDomainConfig();
  try {
    return new URL(dashboardUrl).host;
  } catch {
    return dashboardUrl;
  }
}
