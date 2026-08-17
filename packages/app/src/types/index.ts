import type { VerifiedEvent } from 'nostr-tools';

// ── Record types ──────────────────────────────────────────────────────────────

export interface BunkerConnectionRecord {
  id: string;
  name: string;
  nsec: string;
  expiration: number;
  whitelisted_npub: string;
  relays: string;
  permissions?: string;
  created_at: number;
  updated_at: number;
}

/**
 * Safe projection of BunkerConnectionRecord with the `nsec` private key field
 * removed. This is the ONLY type that must be used in HTTP API responses.
 */
export interface SafeBunkerConnectionRecord {
  id: string;
  name: string;
  pubkey: string;
  expiration: number;
  whitelisted_npub: string;
  relays: string;
  permissions?: string;
  rules?: GranularRuleWithLabel[];
  created_at: number;
  updated_at: number;
}

export interface AuthorizedClientRecord {
  client_pubkey: string;
  permissions: string;
  created_at: number;
  updated_at: number;
}

export interface RPCAuditLogRecord {
  id: number;
  client_pubkey: string;
  method: string;
  params: string;
  status: string;
  created_at: number;
}

// ── User profile (stored in SQLite profiles table) ────────────────────────────

export interface UserProfile {
  pubkey: string;
  name?: string;
  nip05?: string;
  picture?: string;
  updated_at: number;
}

// ── NIP-98 / NIP-46 protocol types ───────────────────────────────────────────

export interface NIP98AuthContext {
  pubkey: string;
  event: VerifiedEvent;
}

export interface NIP46RequestPayload {
  id: string;
  method: string;
  params: unknown[];
}

export interface NIP46ResponsePayload {
  id: string;
  result?: unknown;
  error?: string;
}

// ── Granular Permissions ─────────────────────────────────────────────────────

export type PermissionPolicy = 'allow' | 'block';

export interface ClientPermissionRecord {
  id: number;
  client_pubkey: string;
  method: string;
  kind: number | null;
  policy: PermissionPolicy;
  created_at: number;
  updated_at: number;
}

export interface GranularRule {
  method: string;
  kind?: number | null;
  policy: PermissionPolicy;
}

export interface GranularRuleWithLabel extends GranularRule {
  label: string;
}

export function getFriendlyOperationLabel(method: string, kind?: number | null): string {
  if (method === 'sign_event') {
    if (kind === undefined || kind === null) return 'Sign Any Event';
    switch (kind) {
      case 0:
        return 'Profile Update';
      case 1:
        return 'Send Post';
      case 3:
        return 'Follows & Contacts';
      case 4:
        return 'Legacy DM (NIP-04)';
      case 6:
        return 'Repost';
      case 7:
        return 'Reaction';
      case 14:
      case 44:
        return 'Direct Message';
      case 10002:
        return 'Relay List';
      case 23194:
      case 7375:
        return 'Wallet / Zaps';
      default:
        return `Sign Event (Kind ${kind})`;
    }
  }
  switch (method) {
    case 'nip04_encrypt':
      return 'Legacy DM Encrypt (NIP-04)';
    case 'nip04_decrypt':
      return 'Legacy DM Decrypt (NIP-04)';
    case 'nip44_encrypt':
      return 'Modern Encrypt (NIP-44)';
    case 'nip44_decrypt':
      return 'Modern Decrypt (NIP-44)';
    case 'get_public_key':
      return 'Read Public Key';
    case 'ping':
      return 'Ping';
    case '*':
      return 'All Operations';
    default:
      return method;
  }
}
