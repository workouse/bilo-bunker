import { generateSecretKey, getPublicKey, finalizeEvent, nip44 } from 'nostr-tools';


const bunkerPubkey = '1832c61825d1a28538ea09062dbe70ec40e9344b7f0d3bb55bb37db222688168';
const relays = ['wss://relay.damus.io', 'wss://relay.nostr.band'];

const clientSk = generateSecretKey();
const clientPk = getPublicKey(clientSk);

console.log(`[+] Generated Client Pubkey: ${clientPk}`);
console.log(`[+] Target Bunker Pubkey: ${bunkerPubkey}`);

const payload = JSON.stringify({
  id: Math.random().toString(36).substring(2, 10),
  method: 'connect',
  params: [clientPk, '']
});

console.log(`[+] NIP-46 Payload:`, payload);

const conversationKey = nip44.v2.utils.getConversationKey(clientSk, bunkerPubkey);
const ciphertext = nip44.v2.encrypt(payload, conversationKey);

const eventTemplate = {
  kind: 24133,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['p', bunkerPubkey]],
  content: ciphertext
};

const signedEvent = finalizeEvent(eventTemplate, clientSk);

console.log(`[+] Connecting to Relays...`);

let responded = false;

relays.forEach(relayUrl => {
  const ws = new WebSocket(relayUrl);
  
  ws.addEventListener('open', () => {
    console.log(`[+] Connected to ${relayUrl}`);
    
    // Subscribe to responses
    const subId = 'test-sub-' + Math.random().toString(36).substring(2, 8);
    ws.send(JSON.stringify([
      "REQ", subId, {
        kinds: [24133],
        "#p": [clientPk],
        since: Math.floor(Date.now() / 1000)
      }
    ]));

    // Publish request
    ws.send(JSON.stringify(["EVENT", signedEvent]));
    console.log(`[+] Sent NIP-46 Request via ${relayUrl}`);
  });

  ws.addEventListener('message', (event) => {
    const data = event.data;
    const msg = JSON.parse(data.toString());
    if (msg[0] === 'EVENT') {
      const respEvent = msg[2];
      if (respEvent.pubkey === bunkerPubkey) {
        console.log(`[+] Received Response Event from Bunker!`);
        try {
          const pt = nip44.v2.decrypt(respEvent.content, conversationKey);
          console.log(`[+] Decrypted Response:`, pt);
          responded = true;
          process.exit(0);
        } catch (e) {
          console.error(`[-] Failed to decrypt response:`, e);
        }
      }
    }
  });

  ws.addEventListener('error', (event) => {
    console.error(`[-] Relay Error (${relayUrl}):`, event.message || event);
  });
});

setTimeout(() => {
  if (!responded) {
    console.error(`[-] Timeout: No response from Bunker after 10 seconds.`);
    process.exit(1);
  }
}, 10000);
