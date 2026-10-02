// Send a NIP-46 `connect` request to a bunker from an ephemeral client key
// and wait for the encrypted response.
//
//   pnpm --filter @bilo-bunker/app debug:nip46 -- --uri 'bunker://<pubkey>?relay=wss://...&secret=...'
//   pnpm --filter @bilo-bunker/app debug:nip46 -- --bunker <hex|npub> [--relay wss://...] [--secret s]
import { parseArgs } from 'node:util';
import { generateSecretKey, getPublicKey, finalizeEvent, nip44 } from 'nostr-tools';
import { DEFAULT_RELAYS, toHexPubkey, usage, cliArgs } from './_args.mjs';

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    uri: { type: 'string' },
    bunker: { type: 'string' },
    relay: { type: 'string', multiple: true },
    secret: { type: 'string', default: '' },
    timeout: { type: 'string', default: '10' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || (!values.uri && !values.bunker)) {
  usage(`
Usage: nip46-connect.mjs (--uri <bunker://...> | --bunker <hex|npub>) [--relay <url>]... [--secret <s>] [--timeout <sec>]
Relays default to the URI's relay params, then DEFAULT_RELAYS.`);
}

let bunkerPubkey;
let relays = values.relay ?? [];
let secret = values.secret;
if (values.uri) {
  const u = new URL(values.uri);
  bunkerPubkey = toHexPubkey(u.hostname || u.pathname.replace(/^\/\//, ''), '--uri pubkey');
  if (relays.length === 0) relays = u.searchParams.getAll('relay');
  secret ||= u.searchParams.get('secret') ?? '';
} else {
  bunkerPubkey = toHexPubkey(values.bunker, '--bunker');
}
if (relays.length === 0) relays = DEFAULT_RELAYS;

const clientSk = generateSecretKey();
const clientPk = getPublicKey(clientSk);
const conversationKey = nip44.v2.utils.getConversationKey(clientSk, bunkerPubkey);
const requestId = Math.random().toString(36).slice(2, 10);

console.log(`[+] Client pubkey (ephemeral): ${clientPk}`);
console.log(`[+] Bunker pubkey:             ${bunkerPubkey}`);
console.log(`[+] Relays:                    ${relays.join(', ')}`);

const request = finalizeEvent(
  {
    kind: 24133,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', bunkerPubkey]],
    content: nip44.v2.encrypt(
      JSON.stringify({ id: requestId, method: 'connect', params: [bunkerPubkey, secret] }),
      conversationKey
    ),
  },
  clientSk
);

for (const relayUrl of relays) {
  const ws = new WebSocket(relayUrl);
  ws.addEventListener('open', () => {
    ws.send(
      JSON.stringify(['REQ', 'nip46-connect', { kinds: [24133], '#p': [clientPk], since: request.created_at - 5 }])
    );
    ws.send(JSON.stringify(['EVENT', request]));
    console.log(`[+] Sent connect request via ${relayUrl}`);
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data.toString());
    if (msg[0] === 'OK' && msg[2] === false) console.error(`[-] ${relayUrl} rejected event: ${msg[3]}`);
    if (msg[0] !== 'EVENT' || msg[2]?.pubkey !== bunkerPubkey) return;
    try {
      const response = JSON.parse(nip44.v2.decrypt(msg[2].content, conversationKey));
      if (response.id !== requestId) return;
      console.log(`[+] Response via ${relayUrl}:`, response);
      process.exit(response.error ? 1 : 0);
    } catch (err) {
      console.error('[-] Failed to decrypt response:', err);
    }
  });
  ws.addEventListener('error', () => console.error(`[-] Relay error: ${relayUrl}`));
}

setTimeout(() => {
  console.error(`[-] Timeout: no response from bunker after ${values.timeout}s`);
  process.exit(1);
}, Number(values.timeout) * 1000);
