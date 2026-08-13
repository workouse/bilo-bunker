

const bunkerPubkey = '1832c61825d1a28538ea09062dbe70ec40e9344b7f0d3bb55bb37db222688168';
const clientPubkey = 'd822c357473f27d9fe8f4e78f5f83f1a761888542fc066314f6df1f3f6c651cc';
const relays = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.emre.xyz'
];

console.log(`[+] Sniffing relays for NIP-46 traffic destined to Bunker: ${bunkerPubkey}`);
console.log(`[+] Filtering for client: ${clientPubkey} (Optional)\n`);

const since = Math.floor(Date.now() / 1000) - 1800; // Look back 30 minutes

relays.forEach(relayUrl => {
  const ws = new WebSocket(relayUrl);
  
  ws.addEventListener('open', () => {
    console.log(`[+] Connected to ${relayUrl}`);
    
    // Subscribe to ANY kind destined to our bunker pubkey
    const req = ["REQ", "sniff-sub", {
      "#p": [bunkerPubkey],
      since: since
    }];
    ws.send(JSON.stringify(req));
  });

  ws.addEventListener('message', (event) => {
    const data = event.data;
    try {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'EVENT' && msg[1] === 'sniff-sub') {
        const event = msg[2];
        console.log(`\n=================================================`);
        console.log(`[+] EVENT DETECTED ON: ${relayUrl}`);
        console.log(`    Kind:       ${event.kind}`);
        console.log(`    Sender:     ${event.pubkey}`);
        console.log(`    Created At: ${new Date(event.created_at * 1000).toLocaleString()}`);
        console.log(`    ID:         ${event.id}`);
        
        if (event.pubkey === clientPubkey) {
          console.log(`    ⭐⭐ MATCHES CONSUMER WEBHOOK CLIENT PUBKEY ⭐⭐`);
        }
      }
    } catch (e) {
      // ignore
    }
  });

  ws.addEventListener('error', (event) => {
    console.error(`[-] Relay Error (${relayUrl}):`, event.message || event);
  });
});
