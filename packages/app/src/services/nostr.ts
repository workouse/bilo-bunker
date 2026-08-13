import { verifyEvent, generateSecretKey, getPublicKey, nip44, nip04, nip19, VerifiedEvent } from 'nostr-tools';

export function createKeyPair(): { secretKey: Uint8Array; secretKeyHex: string; publicKey: string } {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const skHex = Array.from(sk).map(b => b.toString(16).padStart(2, '0')).join('');
  return { secretKey: sk, secretKeyHex: skHex, publicKey: pk };
}

export function parseNsecToKeypair(
  nsecInput: string
): { secretKey: Uint8Array; secretKeyHex: string; publicKey: string } | null {
  const trimmed = nsecInput.trim();
  if (!trimmed) return null;

  let skBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    skBytes = hexToBytes(trimmed);
  } else if (trimmed.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'nsec' && decoded.data instanceof Uint8Array) {
        skBytes = decoded.data;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const skHex = bytesToHex(skBytes);
  const pk = getPublicKey(skBytes);
  return { secretKey: skBytes, secretKeyHex: skHex, publicKey: pk };
}

export function parseNpubToHex(npubInput: string): string | null {
  const trimmed = npubInput.trim();
  if (!trimmed) return null;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (trimmed.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'npub' && typeof decoded.data === 'string') {
        return decoded.data.toLowerCase();
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function validateNip98Header(
  authHeader: string,
  requestUrl: string,
  requestMethod: string
): { isValid: boolean; pubkey?: string; error?: string; event?: VerifiedEvent } {
  if (!authHeader || !authHeader.startsWith('Nostr ')) {
    return { isValid: false, error: 'Missing or invalid Authorization scheme. Expected "Nostr <base64-event>"' };
  }

  const base64Event = authHeader.substring(6).trim();
  let event: VerifiedEvent;
  try {
    const jsonStr = atob(base64Event);
    event = JSON.parse(jsonStr);
  } catch (err) {
    return { isValid: false, error: 'Failed to decode base64 NIP-98 auth payload' };
  }

  if (event.kind !== 27235) {
    return { isValid: false, error: `Invalid NIP-98 event kind. Expected 27235, got ${event.kind}` };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - event.created_at) > 60) {
    return { isValid: false, error: 'NIP-98 event timestamp expired or out of bounds (±60 seconds allowed)' };
  }

  const uTag = event.tags.find((t: string[]) => t[0] === 'u')?.[1];
  const mTag = event.tags.find((t: string[]) => t[0] === 'm')?.[1];

  // Reject non-HTTP/HTTPS schemes (e.g., javascript:, data:) before the
  // exact-match comparison. Clients must sign the full URL including any
  // query parameters (NIP-98 option B \u2014 spec-compliant strict mode).
  if (!uTag || (!uTag.startsWith('https://') && !uTag.startsWith('http://'))) {
    return { isValid: false, error: 'NIP-98 URL tag must use https:// or http:// scheme' };
  }

  if (uTag !== requestUrl) {
    return { isValid: false, error: `NIP-98 URL mismatch. Event tag: ${uTag}, Expected: ${requestUrl}` };
  }

  if (!mTag || mTag.toUpperCase() !== requestMethod.toUpperCase()) {
    return { isValid: false, error: `NIP-98 Method mismatch. Event tag: ${mTag}, Expected: ${requestMethod}` };
  }

  if (!verifyEvent(event)) {
    return { isValid: false, error: 'Invalid Nostr signature on NIP-98 event' };
  }

  return { isValid: true, pubkey: event.pubkey, event };
}

export function nip44EncryptPayload(secretKeyHex: string, recipientPubkey: string, plaintext: string): string {
  const skBytes = hexToBytes(secretKeyHex);
  const conversationKey = nip44.v2.utils.getConversationKey(skBytes, recipientPubkey);
  return nip44.v2.encrypt(plaintext, conversationKey);
}

export function nip44DecryptPayload(secretKeyHex: string, senderPubkey: string, ciphertext: string): string {
  const skBytes = hexToBytes(secretKeyHex);
  const conversationKey = nip44.v2.utils.getConversationKey(skBytes, senderPubkey);
  return nip44.v2.decrypt(ciphertext, conversationKey);
}

export async function nip04DecryptPayload(secretKeyHex: string, senderPubkey: string, ciphertext: string): Promise<string> {
  return await nip04.decrypt(secretKeyHex, senderPubkey, ciphertext);
}

export async function nip04EncryptPayload(secretKeyHex: string, recipientPubkey: string, plaintext: string): Promise<string> {
  return await nip04.encrypt(secretKeyHex, recipientPubkey, plaintext);
}

export function extractRelaysFromNostrEvent(event: { kind: number; tags?: string[][]; content?: string }): string[] {
  const relays: string[] = [];

  if (Array.isArray(event.tags)) {
    for (const tag of event.tags) {
      if (!Array.isArray(tag)) continue;
      // NIP-65 kind 10002 uses ['r', 'wss://relay.example.com', 'read'|'write']
      // Kind 3 uses ['p', pubkey, 'wss://relay.example.com'] or ['r', 'wss://...']
      if (tag[0] === 'r' && typeof tag[1] === 'string' && (tag[1].startsWith('wss://') || tag[1].startsWith('ws://'))) {
        relays.push(tag[1]);
      } else if (tag[0] === 'p' && typeof tag[2] === 'string' && (tag[2].startsWith('wss://') || tag[2].startsWith('ws://'))) {
        relays.push(tag[2]);
      }
    }
  }

  // Kind 3 content often contains JSON object: {"wss://relay.example.com": {read: true, write: true}}
  if (event.kind === 3 && event.content) {
    try {
      const parsed = JSON.parse(event.content) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(parsed)) {
          if (key.startsWith('wss://') || key.startsWith('ws://')) {
            relays.push(key);
          }
        }
      }
    } catch {
      // Ignore non-JSON content
    }
  }

  return [...new Set(relays.map(r => r.trim().replace(/\/+$/, '')).filter(Boolean))];
}
