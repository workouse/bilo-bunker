import type { VerifiedEvent } from 'nostr-tools';

// ── Record types ──────────────────────────────────────────────────────────────

export interface BunkerConnectionRecord {
  id: string;
  name: string;
  nsec: string;
  expiration: number;
  whitelisted_npub: string;
  relays: string;
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
