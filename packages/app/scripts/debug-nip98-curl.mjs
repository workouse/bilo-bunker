import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:8787/api/v1/bunker/logs' },
    method: { type: 'string', default: 'GET' },
  }
});

console.log(`\x1b[36m=========================================\x1b[0m`);
console.log(`\x1b[1m⚡ Bilo Bunker - NIP-98 Curl Debugger\x1b[0m`);
console.log(`\x1b[36m=========================================\x1b[0m\n`);

// 1. Generate a transient key for debugging
const sk = generateSecretKey();
const pk = getPublicKey(sk);

console.log(`\x1b[33m🔑 Generated Ephemeral Identity:\x1b[0m`);
console.log(`  Pubkey: ${pk}`);

// 2. Create NIP-98 Event
const eventTemplate = {
  kind: 27235,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['u', values.url],
    ['m', values.method]
  ],
  content: '',
};

const signedEvent = finalizeEvent(eventTemplate, sk);

// 3. Base64 encode the NIP-98 event
const base64Event = Buffer.from(JSON.stringify(signedEvent)).toString('base64');
const authHeader = `Nostr ${base64Event}`;

console.log(`\n\x1b[32m🛡️ Generated NIP-98 Auth Header:\x1b[0m`);
console.log(`  Authorization: ${authHeader.slice(0, 30)}...${authHeader.slice(-10)}`);

// 4. Construct Curl Command
const curlCmd = `curl -i -X ${values.method} \\
  -H "Authorization: ${authHeader}" \\
  -H "Content-Type: application/json" \\
  ${values.url}`;

console.log(`\n\x1b[36m🚀 Run this curl command to debug the workflow:\x1b[0m`);
console.log(`\x1b[90m${curlCmd}\x1b[0m\n`);

// 5. Try running it via fetch to quickly see output
console.log(`\x1b[33m📡 Executing request via Node.js fetch()...\x1b[0m`);
try {
  const start = Date.now();
  const res = await fetch(values.url, {
    method: values.method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  const time = Date.now() - start;
  
  console.log(`\n\x1b[32m✅ Response (${res.status} ${res.statusText}) in ${time}ms:\x1b[0m`);
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.log(text);
  }
} catch (err) {
  console.error(`\n\x1b[31m❌ Error executing request:\x1b[0m`, err);
}
