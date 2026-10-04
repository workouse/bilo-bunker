import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';

// Keep the profile lookup offline: the hook fetches kind 0 from relays on login.
vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  class OfflinePool {
    get = vi.fn().mockResolvedValue(null);
    close = vi.fn();
  }
  return { ...actual, SimplePool: OfflinePool };
});

import { useNostrAuth } from './useNostrAuth';

const PUBKEY = 'a'.repeat(64);

function decodeAuthEvent(header: string | null): EventTemplate {
  expect(header).toMatch(/^Nostr /);
  return JSON.parse(atob(header!.slice('Nostr '.length)));
}

describe('useNostrAuth.fetchWithNip98', () => {
  const fetchMock = vi.fn();
  const signEvent = vi.fn(
    async (template: EventTemplate) => ({ ...template, pubkey: PUBKEY, id: 'id', sig: 'sig' }) as unknown as VerifiedEvent
  );

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_API_URL', '');
    fetchMock.mockReset().mockResolvedValue(new Response('{}'));
    signEvent.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    window.nostr = { getPublicKey: vi.fn().mockResolvedValue(PUBKEY), signEvent };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete window.nostr;
  });

  async function loggedInHook() {
    const hook = renderHook(() => useNostrAuth());
    await act(async () => {
      await hook.result.current.loginWithNip07();
    });
    expect(hook.result.current.pubkey).toBe(PUBKEY);
    return hook;
  }

  it('signs the full same-origin URL and method and sends it as a Nostr auth header', async () => {
    const { result } = await loggedInHook();

    await act(async () => {
      await result.current.fetchWithNip98('/api/v1/bunker/connections', { method: 'post', body: '{}' });
    });

    const expectedUrl = `${window.location.origin}/api/v1/bunker/connections`;
    expect(signEvent).toHaveBeenCalledOnce();
    const template = signEvent.mock.calls[0][0];
    expect(template.kind).toBe(27235);
    expect(template.tags).toEqual([
      ['u', expectedUrl],
      ['m', 'POST'],
    ]);

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(expectedUrl);
    const sent = decodeAuthEvent(new Headers(init.headers).get('Authorization'));
    expect(sent.tags).toEqual(template.tags);
  });

  it('uses VITE_API_URL as the base when set', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/');
    const { result } = await loggedInHook();

    await act(async () => {
      await result.current.fetchWithNip98('api/v1/bunker/uri');
    });

    expect(signEvent.mock.calls[0][0].tags).toEqual([
      ['u', 'https://api.example.com/api/v1/bunker/uri'],
      ['m', 'GET'],
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/v1/bunker/uri');
  });

  it('uses an absolute URL as given', async () => {
    const { result } = await loggedInHook();

    await act(async () => {
      await result.current.fetchWithNip98('https://other.example.com/api/v1/bunker/logs');
    });

    expect(signEvent.mock.calls[0][0].tags[0]).toEqual(['u', 'https://other.example.com/api/v1/bunker/logs']);
  });

  it('throws when not logged in', async () => {
    const { result } = renderHook(() => useNostrAuth());

    await expect(result.current.fetchWithNip98('/api/v1/bunker/uri')).rejects.toThrow(/not logged in/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
