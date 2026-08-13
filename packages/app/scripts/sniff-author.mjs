const clientPubkey = 'd822c357473f27d9fe8f4e78f5f83f1a761888542fc066314f6df1f3f6c651cc';
const relays = ['wss://relay.damus.io', 'wss://relay.emre.xyz'];
const since = Math.floor(Date.now() / 1000) - 3600;

relays.forEach(relayUrl => {
  const ws = new WebSocket(relayUrl);
  ws.addEventListener('open', () => {
    console.log(`[+] Connected to ${relayUrl}`);
    ws.send(JSON.stringify(["REQ", "sniff-author", { authors: [clientPubkey], since }]));
  });
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data.toString());
      if (msg[0] === 'EVENT') {
        const ev = msg[2];
        console.log(`\n[+] Event from ${clientPubkey} on ${relayUrl}:`);
        console.log(`    Kind: ${ev.kind}, ID: ${ev.id}`);
        console.log(`    Tags:`, JSON.stringify(ev.tags));
      }
    } catch(e) {}
  });
});
setTimeout(() => process.exit(0), 5000);
