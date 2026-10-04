#!/usr/bin/env node
// End-to-end NIP-46 check: sends a `connect` request to a bunker through its
// relays and waits for the encrypted reply.
//
//   pnpm --filter @bilo-bunker/app debug:nip46 -- --bunker 'bunker://<pubkey>?relay=wss://...'
//
// Note: a successful connect registers a throwaway client on the bunker
// (visible under authorized apps); revoke it from the dashboard if needed.
import { parseArgs } from 'node:util';
import { generateSecretKey, getPublicKey, finalizeEvent, nip19, nip44 } from 'nostr-tools';

const USAGE = `Usage: nip46-ping --bunker <hex | npub | bunker://URI> [--relay wss://...]... [--secret s] [--timeout 10]

  --bunker   Bunker pubkey (hex or npub) or a full bunker:// URI
  --relay    Relay to use (repeatable). Defaults to the relays in the bunker:// URI
  --secret   Connection secret (defaults to the one in the bunker:// URI)
  --timeout  Seconds to wait for a reply (default 10)`;

const { values } = parseArgs({
  // `pnpm debug:x -- --flag` forwards the `--` literally; drop it.
  args: process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === '--')),
  options: {
    bunker: { type: 'string' },
    relay: { type: 'string', multiple: true, default: [] },
    secret: { type: 'string' },
    timeout: { type: 'string', default: '10' },
    help: { type: 'boolean', short: 'h' },
  },
});

function fail(message) {
  console.error(`Error: ${message}\n\n${USAGE}`);
  process.exit(2);
}

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!values.bunker) fail('--bunker is required');

function parseBunker(input) {
  const value = input.trim();
  if (value.startsWith('bunker://')) {
    const url = new URL(value);
    return {
      pubkey: parsePubkey(url.hostname || url.pathname.replace(/^\/+/, '')),
      relays: url.searchParams.getAll('relay'),
      secret: url.searchParams.get('secret') ?? undefined,
    };
  }
  return { pubkey: parsePubkey(value), relays: [], secret: undefined };
}

function parsePubkey(value) {
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  if (value.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'npub') return decoded.data;
    } catch {
      // fall through to the usage error below
    }
  }
  fail(`invalid bunker pubkey: ${value}`);
}

const target = parseBunker(values.bunker);
const relays = values.relay.length > 0 ? values.relay : target.relays;
const secret = values.secret ?? target.secret ?? '';
const timeoutSeconds = Number(values.timeout);
if (relays.length === 0) fail('no relays: pass --relay or use a bunker:// URI with relay= params');
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) fail('--timeout must be a positive number');

const clientSk = generateSecretKey();
const clientPk = getPublicKey(clientSk);
const conversationKey = nip44.v2.utils.getConversationKey(clientSk, target.pubkey);
const requestId = Math.random().toString(36).slice(2, 10);

const request = finalizeEvent(
  {
    kind: 24133,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', target.pubkey]],
    content: nip44.v2.encrypt(
      JSON.stringify({ id: requestId, method: 'connect', params: [target.pubkey, secret] }),
      conversationKey
    ),
  },
  clientSk
);

console.log(`[+] Bunker:  ${target.pubkey}`);
console.log(`[+] Client:  ${clientPk} (throwaway)`);
console.log(`[+] Relays:  ${relays.join(', ')}`);

for (const relayUrl of relays) {
  const ws = new WebSocket(relayUrl);

  ws.addEventListener('open', () => {
    ws.send(
      JSON.stringify([
        'REQ',
        `nip46-ping-${requestId}`,
        { kinds: [24133], '#p': [clientPk], since: Math.floor(Date.now() / 1000) - 5 },
      ])
    );
    ws.send(JSON.stringify(['EVENT', request]));
    console.log(`[+] Sent connect request via ${relayUrl}`);
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data.toString());
    } catch {
      return;
    }
    if (msg[0] === 'OK' && msg[1] === request.id && msg[2] === false) {
      console.error(`[-] ${relayUrl} rejected the request: ${msg[3]}`);
    }
    if (msg[0] !== 'EVENT' || msg[2]?.pubkey !== target.pubkey) return;
    try {
      const reply = JSON.parse(nip44.v2.decrypt(msg[2].content, conversationKey));
      if (reply.id !== requestId) return;
      console.log(`[+] Reply via ${relayUrl}:`, reply);
      process.exit(reply.error ? 1 : 0);
    } catch (err) {
      console.error(`[-] Failed to decrypt reply from ${relayUrl}:`, err.message ?? err);
    }
  });

  ws.addEventListener('error', (event) => {
    console.error(`[-] Relay error (${relayUrl}):`, event.message ?? 'connection failed');
  });
}

setTimeout(() => {
  console.error(`[-] Timeout: no reply from the bunker after ${timeoutSeconds}s`);
  process.exit(1);
}, timeoutSeconds * 1000);
