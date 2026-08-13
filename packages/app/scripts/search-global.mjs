const bunkerPubkey = '1832c61825d1a28538ea09062dbe70ec40e9344b7f0d3bb55bb37db222688168';
const relays = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.current.fyi',
  'wss://relay.snort.social',
  'wss://purplepag.es',
  'wss://relay.nostr.band'
];

const since = Math.floor(Date.now() / 1000) - 7200; // Last 2 hours

relays.forEach(relayUrl => {
  const ws = new WebSocket(relayUrl);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify(["REQ", "global-search", { "#p": [bunkerPubkey], since }]));
  });
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data.toString());
      if (msg[0] === 'EVENT') {
        const ev = msg[2];
        console.log(`[+] Event on ${relayUrl}: Kind: ${ev.kind}, Author: ${ev.pubkey}, Created At: ${new Date(ev.created_at * 1000).toLocaleString()}`);
      }
    } catch(e) {}
  });
});
setTimeout(() => process.exit(0), 10000);
