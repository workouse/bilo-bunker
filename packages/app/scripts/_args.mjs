// Shared helpers for the debug scripts in this folder.
import { nip19 } from 'nostr-tools';

export const DEFAULT_RELAYS = (process.env.DEFAULT_RELAYS || 'wss://relay.damus.io,wss://nos.lol')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

/** Accepts 64-char hex or npub1… and returns lowercase hex, or exits with an error. */
export function toHexPubkey(input, flag) {
  const v = (input || '').trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
  if (v.startsWith('npub1')) {
    const d = nip19.decode(v);
    if (d.type === 'npub') return d.data;
  }
  console.error(`Invalid ${flag}: expected 64-char hex or npub1…`);
  process.exit(2);
}

export function usage(text) {
  console.log(text.trim());
  process.exit(0);
}

/** CLI args without a leading `--` (pnpm forwards it literally: `pnpm debug:x -- --flag`). */
export function cliArgs() {
  const args = process.argv.slice(2);
  return args[0] === '--' ? args.slice(1) : args;
}
