// Watch relays for events tagged to a bunker pubkey (NIP-46 traffic), or
// authored by a given client. Useful when a client says "no response".
//
//   pnpm --filter @bilo-bunker/app debug:sniff -- --bunker <hex|npub> [--client <hex|npub>]
import { parseArgs } from 'node:util';
import { DEFAULT_RELAYS, toHexPubkey, usage, cliArgs } from './_args.mjs';

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    bunker: { type: 'string' },
    client: { type: 'string' },
    relay: { type: 'string', multiple: true },
    since: { type: 'string', default: '30' },
    duration: { type: 'string', default: '0' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || (!values.bunker && !values.client)) {
  usage(`
Usage: sniff-relays.mjs [--bunker <hex|npub>] [--client <hex|npub>] [--relay <url>]...
                        [--since <minutes back, default 30>] [--duration <seconds, 0 = forever>]
At least one of --bunker / --client is required. Relays default to DEFAULT_RELAYS.`);
}

const bunker = values.bunker ? toHexPubkey(values.bunker, '--bunker') : null;
const client = values.client ? toHexPubkey(values.client, '--client') : null;
const relays = values.relay ?? DEFAULT_RELAYS;
const since = Math.floor(Date.now() / 1000) - Number(values.since) * 60;

const filters = [];
if (bunker) filters.push({ '#p': [bunker], since });
if (client) filters.push({ authors: [client], since });

console.log(`[+] Watching ${relays.join(', ')}`);
if (bunker) console.log(`    events tagged to bunker ${bunker}`);
if (client) console.log(`    events authored by client ${client}`);

const seen = new Set();
for (const relayUrl of relays) {
  const ws = new WebSocket(relayUrl);
  ws.addEventListener('open', () => ws.send(JSON.stringify(['REQ', 'sniff', ...filters])));
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data.toString());
    } catch {
      return;
    }
    if (msg[0] === 'EOSE') console.log(`[=] ${relayUrl}: end of stored events, now live`);
    if (msg[0] !== 'EVENT') return;
    const e = msg[2];
    const dup = seen.has(e.id);
    seen.add(e.id);
    console.log(
      `[+] ${new Date(e.created_at * 1000).toISOString()} kind=${e.kind} id=${e.id.slice(0, 12)}… ` +
        `from=${e.pubkey === bunker ? 'BUNKER' : e.pubkey === client ? 'CLIENT' : e.pubkey.slice(0, 12) + '…'} ` +
        `via ${relayUrl}${dup ? ' (dup)' : ''}`
    );
  });
  ws.addEventListener('error', () => console.error(`[-] Relay error: ${relayUrl}`));
}

if (Number(values.duration) > 0) setTimeout(() => process.exit(0), Number(values.duration) * 1000);
