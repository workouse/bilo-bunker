// Make a NIP-98 authenticated HTTP request against the bunker API and print
// the equivalent curl command. Uses an ephemeral key unless --nsec is given.
//
//   pnpm --filter @bilo-bunker/app debug:nip98 -- --url http://localhost:3000/api/v1/bunker/logs
import { parseArgs } from 'node:util';
import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import { usage, cliArgs } from './_args.mjs';

const { values } = parseArgs({
  args: cliArgs(),
  options: {
    url: { type: 'string', default: `http://localhost:${process.env.PORT || 3000}/api/v1/bunker/logs` },
    method: { type: 'string', default: 'GET' },
    body: { type: 'string' },
    nsec: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  usage(`
Usage: nip98-request.mjs [--url <url>] [--method GET] [--body <json>] [--nsec <nsec1…|hex>]
The signed "u" tag must equal the public URL the server reconstructs (see PUBLIC_URL in README).`);
}

let sk;
if (values.nsec) {
  const v = values.nsec.trim();
  sk = v.startsWith('nsec1') ? nip19.decode(v).data : Uint8Array.from(Buffer.from(v, 'hex'));
} else {
  sk = generateSecretKey();
}
const method = values.method.toUpperCase();

console.log(`[+] Signing as ${getPublicKey(sk)}${values.nsec ? '' : ' (ephemeral)'}`);

const event = finalizeEvent(
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
const authHeader = `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;

console.log('\n[+] Equivalent curl:');
console.log(`curl -i -X ${method} -H 'Authorization: ${authHeader}' -H 'Content-Type: application/json'${
  values.body ? ` --data '${values.body}'` : ''
} '${values.url}'\n`);

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
  console.error('[-] Request failed:', err);
  process.exit(1);
}
