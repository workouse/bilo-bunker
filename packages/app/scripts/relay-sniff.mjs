#!/usr/bin/env node
// Watches relays for events addressed to (--p) and/or authored by (--author)
// a pubkey. Useful to check whether NIP-46 traffic reaches a relay at all.
//
//   pnpm --filter @bilo-bunker/app debug:sniff -- --p <bunker-pubkey> --relay wss://relay.damus.io
import { parseArgs } from 'node:util';
import { nip19 } from 'nostr-tools';

const USAGE = `Usage: relay-sniff (--p <pubkey> | --author <pubkey>) --relay wss://... [--relay ...] [--since 30] [--duration 60] [--kind N]...

  --p         Show events addressed to this pubkey (#p tag), e.g. the bunker
  --author    Show events signed by this pubkey, e.g. a client app
  --relay     Relay to watch (repeatable, at least one)
  --since     Look back this many minutes (default 30)
  --duration  Stop after this many seconds (default 60, 0 = run until Ctrl-C)
  --kind      Only these event kinds (repeatable, e.g. 24133)`;

const { values } = parseArgs({
  // `pnpm debug:x -- --flag` forwards the `--` literally; drop it.
  args: process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === '--')),
  options: {
    p: { type: 'string' },
    author: { type: 'string' },
    relay: { type: 'string', multiple: true, default: [] },
    since: { type: 'string', default: '30' },
    duration: { type: 'string', default: '60' },
    kind: { type: 'string', multiple: true, default: [] },
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

function parsePubkey(value, flag) {
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  if (value.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'npub') return decoded.data;
    } catch {
      // fall through to the usage error below
    }
  }
  fail(`${flag} must be a 64-char hex pubkey or npub`);
}

if (!values.p && !values.author) fail('pass --p and/or --author');
if (values.relay.length === 0) fail('pass at least one --relay');
const sinceMinutes = Number(values.since);
const durationSeconds = Number(values.duration);
if (!Number.isFinite(sinceMinutes) || sinceMinutes < 0) fail('--since must be a number of minutes');
if (!Number.isFinite(durationSeconds) || durationSeconds < 0) fail('--duration must be a number of seconds');

const filter = { since: Math.floor(Date.now() / 1000) - Math.round(sinceMinutes * 60) };
if (values.p) filter['#p'] = [parsePubkey(values.p, '--p')];
if (values.author) filter.authors = [parsePubkey(values.author, '--author')];
if (values.kind.length > 0) filter.kinds = values.kind.map(Number);

console.log(`[+] Filter: ${JSON.stringify(filter)}`);

const seen = new Set();
for (const relayUrl of values.relay) {
  const ws = new WebSocket(relayUrl);

  ws.addEventListener('open', () => {
    console.log(`[+] Connected to ${relayUrl}`);
    ws.send(JSON.stringify(['REQ', 'relay-sniff', filter]));
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data.toString());
    } catch {
      return;
    }
    if (msg[0] === 'EOSE') console.log(`[+] ${relayUrl}: end of stored events, now live`);
    if (msg[0] === 'NOTICE' || msg[0] === 'CLOSED') console.log(`[!] ${relayUrl}: ${msg.slice(1).join(' ')}`);
    if (msg[0] !== 'EVENT' || msg[1] !== 'relay-sniff') return;
    const ev = msg[2];
    const dup = seen.has(ev.id);
    seen.add(ev.id);
    console.log(
      `${new Date(ev.created_at * 1000).toISOString()}  ${relayUrl}  kind=${ev.kind}  from=${ev.pubkey}  id=${ev.id}${dup ? '  (also seen on another relay)' : ''}`
    );
  });

  ws.addEventListener('error', (event) => {
    console.error(`[-] Relay error (${relayUrl}):`, event.message ?? 'connection failed');
  });
}

if (durationSeconds > 0) {
  setTimeout(() => {
    console.log(`[+] Done after ${durationSeconds}s, ${seen.size} unique event(s)`);
    process.exit(0);
  }, durationSeconds * 1000);
}
