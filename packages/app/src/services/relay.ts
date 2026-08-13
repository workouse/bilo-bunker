import WebSocket from 'ws';
import type Database from 'better-sqlite3';
import type { BunkerService } from './bunker.js';

// ── RelayManager ──────────────────────────────────────────────────────────────
//
// Manages persistent WebSocket connections to every Nostr relay URL returned by
// BunkerService.getRelayUrls(). For each connection it:
//   1. Sends a REQ subscription for NIP-46 event kinds (104, 24133, 1059)
//      addressed to the bunker public key, anchored to the last processed
//      event timestamp so we never miss events across restarts.
//   2. Delegates each inbound EVENT to BunkerService.handleNip46Request().
//   3. Reconnects automatically with exponential back-off (2 s → 60 s cap)
//      whenever a connection is lost.
//
// Lifecycle:
//   const relay = new RelayManager(bunker, db);
//   await relay.start();   // called from index.ts after app is listening
//   ...
//   await relay.stop();    // called from SIGTERM / SIGINT handlers

const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const STABILITY_WINDOW_MS = 15_000;
const PING_INTERVAL_MS = 15_000;
const SUBSCRIPTION_ID = 'nip46-sub';

// ── 6.1 Class skeleton ────────────────────────────────────────────────────────

export class RelayManager {
  private readonly bunker: BunkerService;
  private readonly db: Database.Database;

  /** One live WebSocket per relay URL. Keyed by the relay URL string. */
  private readonly connections = new Map<string, WebSocket>();

  /** Pending setTimeout handle for each relay URL that is waiting to reconnect. */
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Pending stability timer per relay URL. Reset delay/attempts only after remaining open for STABILITY_WINDOW_MS. */
  private readonly stabilityTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Current back-off delay in ms per relay URL, resets to INITIAL on successful open. */
  private readonly reconnectDelay = new Map<string, number>();

  /** Relays permanently disabled due to host/network errors or max consecutive retries. */
  private readonly disabledRelays = new Set<string>();

  /** Number of consecutive failed connection attempts per relay URL. */
  private readonly failedAttempts = new Map<string, number>();

  /** Periodic ping interval handle to keep connections alive. */
  private pingIntervalTimer?: ReturnType<typeof setInterval>;

  /** Set to true by stop() to prevent any new connections from being opened. */
  private stopped = false;

  constructor(bunker: BunkerService, db: Database.Database) {
    this.bunker = bunker;
    this.db = db;
  }

  private isPermanentError(errMsg: string): boolean {
    const lower = errMsg.toLowerCase();
    return (
      lower.includes('ehostunreach') ||
      lower.includes('enotfound') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('eai_again') ||
      lower.includes('404') ||
      lower.includes('403') ||
      lower.includes('401') ||
      lower.includes('400') ||
      lower.includes('unexpected server response') ||
      lower.includes('invalid url')
    );
  }

  // ── 6.2 start() ──────────────────────────────────────────────────────────────

  /**
   * Connect to all relay URLs sourced from BunkerService.
   * Resolves immediately after kicking off all connections (they are async).
   */
  async start(): Promise<void> {
    const urls = this.bunker.getRelayUrls();

    if (urls.length === 0) {
      console.warn('[relay] No relay URLs configured. Set DEFAULT_RELAYS or add a connection.');
    } else {
      console.log(`[relay] Starting — connecting to ${urls.length} relay(s)`);
      for (const url of urls) {
        this.connect(url);
      }
    }

    // Start periodic WebSocket keep-alive ping loop to prevent idle timeouts
    if (!this.pingIntervalTimer) {
      this.pingIntervalTimer = setInterval(() => {
        this.sendPingHeartbeats();
      }, PING_INTERVAL_MS);
    }

    // Background fetch NIP-65 & Kind 3 user personal relays from Nostr indexers
    this.bunker
      .fetchUserRelaysFromNetwork()
      .then((discovered) => {
        if (discovered.length > 0) {
          const freshUrls = this.bunker.getRelayUrls();
          console.log(`[relay] Updating relay pool with ${freshUrls.length} total relay(s)`);
          for (const url of freshUrls) {
            this.connect(url);
          }
        }
      })
      .catch((err: unknown) => {
        console.warn('[relay] Background NIP-65 relay discovery warning:', err);
      });
  }

  /** Send WebSocket ping frames to all open connections to prevent idle connection drop. */
  private sendPingHeartbeats(): void {
    for (const [url, ws] of this.connections.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (err) {
          console.warn(`[relay] Failed to send ping to ${url}:`, err);
        }
      }
    }
  }

  // ── 6.3 connect(relayUrl) ────────────────────────────────────────────────────

  /**
   * Open (or re-open) a WebSocket to the given relay URL.
   * Guards against double-connect, disabled relays, and respects the stopped flag.
   */
  connect(relayUrl: string): void {
    if (this.stopped || this.disabledRelays.has(relayUrl)) return;

    const existing = this.connections.get(relayUrl);
    if (existing?.readyState === WebSocket.OPEN) return;

    // Cancel any pending reconnect timer — we are connecting right now.
    const pendingTimer = this.reconnectTimers.get(relayUrl);
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      this.reconnectTimers.delete(relayUrl);
    }

    let lastErrorMessage = '';

    const ws = new WebSocket(relayUrl);

    ws.on('open', () => {
      this.connections.set(relayUrl, ws);
      this.subscribe(ws);
      console.log(`[relay] connected: ${relayUrl}`);

      // Reset back-off delay and failure count ONLY after staying connected for STABILITY_WINDOW_MS
      const existingTimer = this.stabilityTimers.get(relayUrl);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        this.stabilityTimers.delete(relayUrl);
        this.reconnectDelay.set(relayUrl, INITIAL_RECONNECT_DELAY_MS);
        this.failedAttempts.delete(relayUrl);
      }, STABILITY_WINDOW_MS);

      this.stabilityTimers.set(relayUrl, timer);
    });

    ws.on('message', (data) => {
      this.handleMessage(relayUrl, data.toString()).catch((err: unknown) => {
        console.error(`[relay] handleMessage error on ${relayUrl}:`, err);
      });
    });

    ws.on('close', (code, reason) => {
      this.connections.delete(relayUrl);

      // Cancel stability timer if disconnected before reaching stability window
      const timer = this.stabilityTimers.get(relayUrl);
      if (timer) {
        clearTimeout(timer);
        this.stabilityTimers.delete(relayUrl);
      }

      console.log(
        `[relay] disconnected: ${relayUrl} (code=${code} reason=${reason.toString() || 'none'})`
      );
      this.scheduleReconnect(relayUrl, lastErrorMessage);
    });

    ws.on('error', (err) => {
      lastErrorMessage = err ? err.message : 'WebSocket error';
      console.error(`[relay] error on ${relayUrl}:`, lastErrorMessage);

      if (this.isPermanentError(lastErrorMessage)) {
        this.disabledRelays.add(relayUrl);
        console.warn(
          `[relay] Disabling autoconnect for permanently unreachable relay: ${relayUrl} (reason: ${lastErrorMessage})`
        );
      }

      // The 'close' event will fire after terminate() and trigger scheduleReconnect.
      ws.terminate();
    });
  }

  // ── 6.4 subscribe(ws) ────────────────────────────────────────────────────────

  /**
   * Send a REQ subscription to the relay for all NIP-46 event kinds
   * addressed to the bunker's public key. The `since` filter is set to
   * the last successfully processed event timestamp minus a safety buffer (60s)
   * so that events are not missed across reconnects or minor clock skew.
   */
  private subscribe(ws: WebSocket): void {
    const pubkeys = this.bunker.getAllPublicKeys();

    const sinceRow = this.db
      .prepare<[], { value: string }>(
        "SELECT value FROM state WHERE key = 'last_processed_timestamp'"
      )
      .get();

    // Apply 3600s safety margin to since filter to account for clock skew and network latency
    const since = sinceRow
      ? Math.max(0, Number(sinceRow.value) - 3_600)
      : Math.floor(Date.now() / 1000) - 86_400;

    const req = [
      'REQ',
      SUBSCRIPTION_ID,
      { kinds: [4, 104, 24133, 1059], '#p': pubkeys, since },
    ];

    ws.send(JSON.stringify(req));
    console.log(
      `[relay] subscribed to ${pubkeys.length} pubkey(s) (since=${since}) on ${
        (ws as WebSocket & { url?: string }).url ?? 'unknown'
      }`
    );
  }

  // ── 6.5 handleMessage(relayUrl, raw) ─────────────────────────────────────────

  /**
   * Parse a raw relay frame and route EVENT messages to BunkerService.
   * Non-EVENT frames (EOSE, NOTICE, OK, etc.) are silently ignored.
   */
  async handleMessage(relayUrl: string, raw: string): Promise<void> {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    if (!Array.isArray(frame)) return;

    const [type, subId, event] = frame as [string, string, Record<string, unknown>];

    if (type !== 'EVENT') return;
    if (subId !== SUBSCRIPTION_ID) return;
    if (!event || typeof event !== 'object') return;

    console.log(
      `[relay] Inbound NIP-46 event (kind ${event['kind']}, id: ${event['id']}) received from ${relayUrl}`
    );

    const openConnections = Array.from(this.connections.values()).filter(
      (conn) => conn.readyState === WebSocket.OPEN
    );

    if (openConnections.length === 0) {
      console.warn(
        `[relay] No open connection available to send NIP-46 response (received on ${relayUrl})`
      );
      return;
    }

    // Broadcast response over all open relay sockets to ensure client receives it regardless of relay pool
    const broadcastWs = {
      send: (msg: string) => {
        let sentCount = 0;
        for (const conn of this.connections.values()) {
          if (conn.readyState === WebSocket.OPEN) {
            conn.send(msg);
            sentCount++;
          }
        }
        console.log(
          `[relay] Broadcast NIP-46 response to ${sentCount} open relay socket(s) (inbound from ${relayUrl})`
        );
      },
    } as WebSocket;

    // Delegate to BunkerService — it verifies, decrypts, routes, and responds.
    await this.bunker.handleNip46Request(
      event as unknown as Parameters<BunkerService['handleNip46Request']>[0],
      broadcastWs
    );
  }

  // ── 6.6 scheduleReconnect(relayUrl) ──────────────────────────────────────────

  /**
   * Schedule a reconnect attempt for `relayUrl` after the current back-off delay.
   * Uses exponential back-off: delay doubles on each disconnect until the cap (60s).
   * Permanently disables reconnect ONLY if permanent network errors occur (e.g. ENOTFOUND).
   */
  private scheduleReconnect(relayUrl: string, errorReason?: string): void {
    if (this.stopped || this.disabledRelays.has(relayUrl)) return;
    // Do not schedule a second timer if one is already pending.
    if (this.reconnectTimers.has(relayUrl)) return;

    const attempts = (this.failedAttempts.get(relayUrl) ?? 0) + 1;
    this.failedAttempts.set(relayUrl, attempts);

    if (errorReason && this.isPermanentError(errorReason)) {
      this.disabledRelays.add(relayUrl);
      console.warn(
        `[relay] Disabling autoconnect for permanently unreachable relay: ${relayUrl} (reason: ${errorReason})`
      );
      return;
    }

    const currentDelay = this.reconnectDelay.get(relayUrl) ?? INITIAL_RECONNECT_DELAY_MS;
    const nextDelay = Math.min(currentDelay * 2, MAX_RECONNECT_DELAY_MS);
    // Store the next delay so successive failures keep backing off.
    this.reconnectDelay.set(relayUrl, nextDelay);

    console.log(
      `[relay] reconnecting ${relayUrl} in ${currentDelay / 1_000}s (attempt ${attempts}, next delay: ${nextDelay / 1_000}s)`
    );

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(relayUrl);
      this.connect(relayUrl);
    }, currentDelay);

    this.reconnectTimers.set(relayUrl, timer);
  }

  // ── 6.7 refreshRelays() ───────────────────────────────────────────────────────

  /**
   * Connect to any relay URLs that have been added since the last call to start().
   * Called by HTTP route handlers after createConnection() or updateConnection().
   */
  refreshRelays(): void {
    const urls = this.bunker.getRelayUrls();

    for (const url of urls) {
      this.disabledRelays.delete(url);
      this.failedAttempts.delete(url);

      const existing = this.connections.get(url);
      if (!existing || existing.readyState !== WebSocket.OPEN) {
        this.connect(url);
      }
    }
  }

  // ── 6.8 stop() ───────────────────────────────────────────────────────────────

  /**
   * Gracefully shut down all connections and cancel all pending timers.
   * Must be called from SIGTERM / SIGINT handlers in index.ts.
   */
  async stop(): Promise<void> {
    this.stopped = true;

    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = undefined;
    }

    for (const timer of this.stabilityTimers.values()) {
      clearTimeout(timer);
    }
    this.stabilityTimers.clear();

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.reconnectDelay.clear();

    console.log('[relay] stopped');
  }
}

