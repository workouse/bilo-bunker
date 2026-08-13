const { execSync } = require('child_process');
const WebSocket = require('ws');

const bunkerPubkey = '1832c61825d1a28538ea09062dbe70ec40e9344b7f0d3bb55bb37db222688168';
const relays = ['wss://relay.damus.io', 'wss://relay.emre.xyz', 'wss://relay.nostr.band'];
let eventsSeen = 0;

console.log("[+] Starting sniffer on relays...");
let connected = 0;

relays.forEach(relayUrl => {
  const ws = new WebSocket(relayUrl);
  ws.on('open', () => {
    connected++;
    ws.send(JSON.stringify(["REQ", "sniff-all", { "#p": [bunkerPubkey], limit: 5 }]));
    
    if (connected === 3) {
      console.log("[+] All relays connected. Firing webhook CURL...");
      try {
        const out = execSync(`curl -s -X POST "https://api.bridge.workouse.com/v1/wh/e009d600-1f06-49bd-8b2a-3ea9f042acde" -H "Content-Type: application/json" -H "X-Webhook-Secret: DEMOTEST" -d '{"event": "deploy_status", "message": "Production deployment succeeded", "status": "success"}'`);
        console.log("[+] Webhook Response:", out.toString());
      } catch(e) {
        console.log("[-] Webhook Error:", e.message);
      }
    }
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'EVENT') {
        eventsSeen++;
        console.log(`\n[!] EVENT SEEN ON ${relayUrl} !`);
        console.log(JSON.stringify(msg[2], null, 2));
      }
    } catch(e) {}
  });
});

setTimeout(() => {
  console.log(`\n[+] Test complete. Events seen: ${eventsSeen}`);
  process.exit(0);
}, 15000);
