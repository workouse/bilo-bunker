/**
 * Domain Configuration for Bilo Bunker
 * Handles domain resolution for default Workouse deployment and self-hosted instances.
 */

export interface DomainConfig {
  landingUrl: string;
  dashboardUrl: string;
  apiUrl: string;
  isSelfHosted: boolean;
}

export function getDomainConfig(): DomainConfig {
  const envApiUrl = import.meta.env.VITE_API_URL;
  const envDashboardUrl = import.meta.env.VITE_DASHBOARD_URL;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  // Standard Workouse domains
  const DEFAULT_LANDING = 'https://bunker-bilo.workouse.com';
  const DEFAULT_DASHBOARD = 'https://app.bunker-bilo.workouse.com';
  const DEFAULT_API = 'https://api.bunker-bilo.workouse.com';

  const isWorkouseDomain = currentHost.endsWith('workouse.com');
  const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';
  const isSelfHosted = !isWorkouseDomain && !isLocalhost;

  // Compute API URL
  let apiUrl = DEFAULT_API;
  if (envApiUrl) {
    apiUrl = envApiUrl;
  } else if (isLocalhost) {
    apiUrl = 'http://localhost:3007';
  } else if (isSelfHosted) {
    // Self-hosted fallback: use current origin if relative or api.subdomain
    apiUrl = currentHost.startsWith('app.')
      ? `${window.location.protocol}//api.${currentHost.replace(/^app\./, '')}`
      : `${window.location.protocol}//${window.location.host}`;
  }

  // Compute Dashboard URL
  let dashboardUrl = DEFAULT_DASHBOARD;
  if (envDashboardUrl) {
    dashboardUrl = envDashboardUrl;
  } else if (isSelfHosted) {
    dashboardUrl = `${window.location.protocol}//${window.location.host}`;
  }

  return {
    landingUrl: DEFAULT_LANDING,
    dashboardUrl,
    apiUrl,
    isSelfHosted,
  };
}
