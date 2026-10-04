#!/usr/bin/env node
// Sends a NIP-98 authenticated request to the Bilo Bunker API and prints an
// equivalent curl command.
//
//   pnpm --filter @bilo-bunker/app debug:nip98 -- --url https://bunker.example.com/api/v1/bunker/uri
import { parseArgs } from 'node:util';
import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';

const USAGE = `Usage: nip98-request [--url URL] [--method GET] [--body JSON] [--nsec nsec1...]

  --url     Full API URL to call, exactly as the server sees it
            (default http://localhost:3000/api/v1/bunker/uri)
  --method  HTTP method (default GET)
  --body    JSON request body for POST/PUT
  --nsec    Sign as this user (nsec or hex). Defaults to a throwaway key`;

const { values } = parseArgs({
  // `pnpm debug:x -- --flag` forwards the `--` literally; drop it.
  args: process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === '--')),
  options: {
    url: { type: 'string', default: 'http://localhost:3000/api/v1/bunker/uri' },
    method: { type: 'string', default: 'GET' },
    body: { type: 'string' },
    nsec: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

function fail(message) {
  console.error(`Error: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function parseSecretKey(value) {
  if (/^[0-9a-f]{64}$/i.test(value)) return Uint8Array.from(Buffer.from(value, 'hex'));
  if (value.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'nsec') return decoded.data;
    } catch {
      // fall through to the usage error below
    }
  }
  fail('--nsec must be an nsec1... or 64-char hex secret key');
}

const method = values.method.toUpperCase();
const sk = values.nsec ? parseSecretKey(values.nsec) : generateSecretKey();
console.log(`[+] Signing as ${getPublicKey(sk)}${values.nsec ? '' : ' (throwaway key)'}`);

const authEvent = finalizeEvent(
  {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', values.url],
      ['m', method],
    ],
    content: '',
  },
  sk
);
const authHeader = `Nostr ${Buffer.from(JSON.stringify(authEvent)).toString('base64')}`;

const bodyArg = values.body ? ` \\\n  -d '${values.body}'` : '';
console.log(`[+] Equivalent curl (valid for 60s):\n`);
console.log(
  `curl -i -X ${method} \\\n  -H "Authorization: ${authHeader}" \\\n  -H "Content-Type: application/json"${bodyArg} \\\n  '${values.url}'\n`
);

try {
  const started = Date.now();
  const res = await fetch(values.url, {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: values.body,
  });
  const text = await res.text();
  console.log(`[+] ${res.status} ${res.statusText} in ${Date.now() - started}ms`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error(`[-] Request failed:`, err.cause?.message ?? err.message ?? err);
  process.exit(1);
}
