import { describe, it, expect } from 'vitest';
import { extractRelaysFromNostrEvent } from '../services/nostr.js';

describe('NIP-65 & Kind 3 Relay Extraction', () => {
  it('should extract relays from kind 10002 NIP-65 r tags', () => {
    const event = {
      kind: 10002,
      tags: [
        ['r', 'wss://relay.damus.io', 'read'],
        ['r', 'wss://relay.emre.xyz/', 'write'],
        ['r', 'wss://nos.lol'],
      ],
    };

    const relays = extractRelaysFromNostrEvent(event);
    expect(relays).toContain('wss://relay.damus.io');
    expect(relays).toContain('wss://relay.emre.xyz');
    expect(relays).toContain('wss://nos.lol');
  });

  it('should extract relays from kind 3 JSON content dictionary', () => {
    const event = {
      kind: 3,
      content: JSON.stringify({
        'wss://relay.snort.social': { read: true, write: true },
        'wss://nostr.wine/': { read: true },
      }),
    };

    const relays = extractRelaysFromNostrEvent(event);
    expect(relays).toContain('wss://relay.snort.social');
    expect(relays).toContain('wss://nostr.wine');
  });
});
