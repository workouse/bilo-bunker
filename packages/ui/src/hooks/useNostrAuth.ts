import { useState, useEffect, useCallback } from 'react';
import { nip19, SimplePool, EventTemplate, VerifiedEvent } from 'nostr-tools';
import { getDomainConfig } from '../config/domains';

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: EventTemplate): Promise<VerifiedEvent>;
    };
  }
}

export interface NostrProfile {
  name?: string;
  username?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  pubkey?: string;
}

const DEFAULT_PROFILE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://purplepag.es',
];

export async function fetchKind0FromRelays(pubkey: string): Promise<NostrProfile | null> {
  const pool = new SimplePool();
  try {
    const event = await pool.get(DEFAULT_PROFILE_RELAYS, {
      kinds: [0],
      authors: [pubkey],
    });
    if (event && event.content) {
      const parsed = JSON.parse(event.content);
      return {
        name: parsed.name,
        username: parsed.username || parsed.name,
        display_name: parsed.display_name || parsed.name,
        picture: parsed.picture || parsed.image,
        about: parsed.about,
        nip05: parsed.nip05,
        pubkey,
      };
    }
  } catch (err) {
    console.warn('Failed to query Nostr Kind 0 profile event from relays', err);
  } finally {
    pool.close(DEFAULT_PROFILE_RELAYS);
  }
  return null;
}

export function useNostrAuth() {
  const [pubkey, setPubkey] = useState<string | null>(() => localStorage.getItem('bunker_user_pubkey'));
  const [npub, setNpub] = useState<string | null>(null);
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pubkey) {
      try {
        const npubStr = nip19.npubEncode(pubkey);
        setNpub(npubStr);
      } catch (err) {
        setNpub(pubkey);
      }

      // Load cached profile if present
      const cached = localStorage.getItem(`bunker_profile_${pubkey}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && (parsed.name || parsed.display_name || parsed.picture || parsed.nip05)) {
            setProfile(parsed);
          }
        } catch {
          // ignore cache error
        }
      }

      // Fetch fresh Kind 0 profile from relays
      let isMounted = true;
      fetchKind0FromRelays(pubkey).then((liveProf) => {
        if (isMounted && liveProf) {
          setProfile(liveProf);
          localStorage.setItem(`bunker_profile_${pubkey}`, JSON.stringify(liveProf));
        }
      });

      return () => {
        isMounted = false;
      };
    } else {
      setNpub(null);
      setProfile(null);
    }
  }, [pubkey]);

  const loginWithNip07 = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!window.nostr) {
        throw new Error('Nostr browser extension (NIP-07) not detected. Please install Alby or nos2x.');
      }
      const pk = await window.nostr.getPublicKey();
      setPubkey(pk);
      localStorage.setItem('bunker_user_pubkey', pk);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to authenticate via NIP-07 extension';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setPubkey(null);
    setNpub(null);
    setProfile(null);
    localStorage.removeItem('bunker_user_pubkey');
  }, []);

  const fetchWithNip98 = useCallback(
    async (path: string, options: RequestInit = {}) => {
      if (!pubkey || !window.nostr) {
        throw new Error('User not logged in with NIP-07 extension');
      }

      const { apiUrl } = getDomainConfig();
      const targetUrl = path.startsWith('http')
        ? path
        : `${apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl}${path.startsWith('/') ? path : '/' + path}`;

      const method = (options.method || 'GET').toUpperCase();
      const now = Math.floor(Date.now() / 1000);

      const authEventTemplate: EventTemplate = {
        kind: 27235,
        created_at: now,
        tags: [
          ['u', targetUrl],
          ['m', method],
        ],
        content: '',
      };

      const signedAuthEvent = await window.nostr.signEvent(authEventTemplate);
      const base64Event = btoa(JSON.stringify(signedAuthEvent));

      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Nostr ${base64Event}`);

      return fetch(targetUrl, { ...options, headers });
    },
    [pubkey]
  );

  return {
    pubkey,
    npub,
    profile,
    isLoading,
    error,
    loginWithNip07,
    logout,
    fetchWithNip98,
    hasExtension: typeof window !== 'undefined' && !!window.nostr,
  };
}
