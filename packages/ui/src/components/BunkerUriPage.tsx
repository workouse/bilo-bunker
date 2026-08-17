import React, { useState } from 'react';
import {
  Copy,
  Check,
  QrCode,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  ShieldAlert,
  X,
  Sliders,
  Globe,
  Zap,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { nip19, getPublicKey } from 'nostr-tools';
import { QRCodeSvg } from './QRCodeSvg';
import { GranularRule, PermissionPolicy } from './GranularRulesModal';

function derivePubkeyFromNsec(nsecInput: string | undefined, fallbackPubkey: string): string {
  if (!nsecInput) return fallbackPubkey;
  const trimmed = nsecInput.trim();
  if (!trimmed) return fallbackPubkey;

  try {
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 64; i += 2) {
        bytes[i / 2] = parseInt(trimmed.substring(i, i + 2), 16);
      }
      return getPublicKey(bytes);
    }
    if (trimmed.startsWith('nsec1')) {
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'nsec' && decoded.data instanceof Uint8Array) {
        return getPublicKey(decoded.data);
      }
    }
  } catch {
    // fallback to default
  }
  return fallbackPubkey;
}

export interface BunkerConnection {
  id: string;
  name: string;
  nsec: string;
  pubkey?: string;
  expiration: number;
  whitelisted_npub: string;
  relays: string;
  permissions?: string;
  rules?: GranularRule[];
  created_at: number;
  updated_at: number;
}

interface BunkerUriPageProps {
  bunkerUri: string | null;
  connections: BunkerConnection[];
  userNsec?: string;
  onRefresh: () => void;
  onCreateConnection: (data: {
    name: string;
    nsec: string;
    expiration: number;
    whitelistedNpub: string;
    relays: string[];
    rules?: GranularRule[];
  }) => Promise<void>;
  onEditConnection: (
    id: string,
    data: {
      name: string;
      nsec: string;
      expiration: number;
      whitelistedNpub: string;
      relays: string[];
      rules?: GranularRule[];
    }
  ) => Promise<void>;
  onDeleteConnection: (id: string) => Promise<void>;
  onFetchRelays?: (target: { nsec?: string; pubkey?: string }) => Promise<string[]>;
}

const SOCIAL_PRESET_RULES: GranularRule[] = [
  { method: 'sign_event', kind: 1, policy: 'allow' },
  { method: 'sign_event', kind: 0, policy: 'allow' },
  { method: 'sign_event', kind: 6, policy: 'allow' },
  { method: 'sign_event', kind: 7, policy: 'allow' },
  { method: 'sign_event', kind: 3, policy: 'allow' },
  { method: 'sign_event', kind: 10002, policy: 'allow' },
  { method: 'sign_event', kind: 44, policy: 'block' },
  { method: 'sign_event', kind: 4, policy: 'block' },
  { method: 'sign_event', kind: 23194, policy: 'block' },
  { method: 'sign_event', kind: 7375, policy: 'block' },
  { method: 'nip44_encrypt', kind: null, policy: 'allow' },
  { method: 'nip44_decrypt', kind: null, policy: 'allow' },
  { method: 'get_public_key', kind: null, policy: 'allow' },
  { method: 'ping', kind: null, policy: 'allow' },
];

const PUBLIC_PRESET_RULES: GranularRule[] = [
  { method: 'sign_event', kind: 1, policy: 'allow' },
  { method: 'sign_event', kind: 0, policy: 'allow' },
  { method: 'sign_event', kind: 6, policy: 'allow' },
  { method: 'sign_event', kind: 7, policy: 'allow' },
  { method: 'sign_event', kind: 44, policy: 'block' },
  { method: 'sign_event', kind: 4, policy: 'block' },
  { method: 'sign_event', kind: 23194, policy: 'block' },
  { method: 'nip44_encrypt', kind: null, policy: 'block' },
  { method: 'nip44_decrypt', kind: null, policy: 'block' },
  { method: 'nip04_encrypt', kind: null, policy: 'block' },
  { method: 'nip04_decrypt', kind: null, policy: 'block' },
  { method: 'get_public_key', kind: null, policy: 'allow' },
  { method: 'ping', kind: null, policy: 'allow' },
];

const FULL_ACCESS_RULES: GranularRule[] = [{ method: '*', kind: null, policy: 'allow' }];

const READ_ONLY_RULES: GranularRule[] = [
  { method: 'get_public_key', kind: null, policy: 'allow' },
  { method: 'ping', kind: null, policy: 'allow' },
  { method: 'nip44_encrypt', kind: null, policy: 'allow' },
  { method: 'nip44_decrypt', kind: null, policy: 'allow' },
  { method: 'sign_event', kind: null, policy: 'block' },
];

export const BunkerUriPage: React.FC<BunkerUriPageProps> = ({
  bunkerUri,
  connections,
  userNsec = 'nsec1_logged_in_default_nsec',
  onRefresh,
  onCreateConnection,
  onEditConnection,
  onDeleteConnection,
  onFetchRelays,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFetchingRelays, setIsFetchingRelays] = useState(false);

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<BunkerConnection | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form inputs
  const [formName, setFormName] = useState('');
  const [formNsec, setFormNsec] = useState('');
  const [formExpiration, setFormExpiration] = useState<number>(0);
  const [formWhitelistedNpub, setFormWhitelistedNpub] = useState('');
  const [formRelays, setFormRelays] = useState('wss://relay.damus.io, wss://relay.nostr.band');
  const [formPreset, setFormPreset] = useState<'social' | 'public_only' | 'full' | 'read_only' | 'custom'>('social');
  const [formRules, setFormRules] = useState<GranularRule[]>(SOCIAL_PRESET_RULES);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateModal = () => {
    setFormName('New App Connection');
    setFormNsec(userNsec);
    setFormExpiration(0); // Never
    setFormWhitelistedNpub('');
    setFormRelays('wss://relay.damus.io, wss://relay.nostr.band');
    setFormPreset('social');
    setFormRules(SOCIAL_PRESET_RULES);
    setShowAdvancedRules(false);
    setIsCreateOpen(true);
  };

  const openEditModal = (conn: BunkerConnection) => {
    setEditingConn(conn);
    setFormName(conn.name);
    setFormNsec(conn.nsec);
    setFormExpiration(conn.expiration);
    setFormWhitelistedNpub(conn.whitelisted_npub);
    setFormRelays(conn.relays);
    if (conn.rules && conn.rules.length > 0) {
      setFormRules(conn.rules);
      setFormPreset('custom');
    } else {
      setFormRules(FULL_ACCESS_RULES);
      setFormPreset('full');
    }
    setShowAdvancedRules(false);
  };

  const handleApplyPreset = (preset: 'social' | 'public_only' | 'full' | 'read_only') => {
    setFormPreset(preset);
    switch (preset) {
      case 'social':
        setFormRules(SOCIAL_PRESET_RULES);
        break;
      case 'public_only':
        setFormRules(PUBLIC_PRESET_RULES);
        break;
      case 'full':
        setFormRules(FULL_ACCESS_RULES);
        break;
      case 'read_only':
        setFormRules(READ_ONLY_RULES);
        break;
    }
  };

  const toggleFormRule = (method: string, kind?: number | null) => {
    setFormPreset('custom');
    setFormRules((prev) => {
      const existing = prev.find((r) => r.method === method && r.kind === (kind ?? null));
      const nextPolicy: PermissionPolicy = existing?.policy === 'allow' ? 'block' : 'allow';
      const filtered = prev.filter((r) => !(r.method === method && r.kind === (kind ?? null)));
      return [...filtered, { method, kind: kind ?? null, policy: nextPolicy }];
    });
  };

  const isRuleAllowed = (method: string, kind?: number | null): boolean => {
    const exact = formRules.find((r) => r.method === method && r.kind === (kind ?? null));
    if (exact) return exact.policy === 'allow';

    const methodWildcard = formRules.find(
      (r) => r.method === method && (r.kind === null || r.kind === undefined)
    );
    if (methodWildcard) return methodWildcard.policy === 'allow';

    const global = formRules.find((r) => r.method === '*');
    if (global) return global.policy === 'allow';

    return false;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFetchUserRelays = async () => {
    if (!onFetchRelays) return;
    setIsFetchingRelays(true);
    try {
      const fetched = await onFetchRelays({
        nsec: formNsec || userNsec,
        pubkey: formWhitelistedNpub,
      });
      if (fetched && fetched.length > 0) {
        setFormRelays(fetched.join(', '));
      }
    } catch {
      // Ignore network fetch error
    } finally {
      setIsFetchingRelays(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const relaysArr = formRelays.split(',').map((r) => r.trim()).filter(Boolean);
      await onCreateConnection({
        name: formName,
        nsec: formNsec || userNsec,
        expiration: formExpiration,
        whitelistedNpub: formWhitelistedNpub,
        relays: relaysArr,
        rules: formRules,
      });
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConn) return;
    setIsSubmitting(true);
    try {
      const relaysArr = formRelays.split(',').map((r) => r.trim()).filter(Boolean);
      await onEditConnection(editingConn.id, {
        name: formName,
        nsec: formNsec,
        expiration: formExpiration,
        whitelistedNpub: formWhitelistedNpub,
        relays: relaysArr,
        rules: formRules,
      });
      setEditingConn(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setIsSubmitting(true);
    try {
      await onDeleteConnection(deletingId);
      setDeletingId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">NIP-46 Bunker Connection Strings</h2>
          <p className="text-sm text-dark-muted">
            Manage remote signer connection URIs, expiration, and granular security rules
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={onRefresh}
            className="flex items-center space-x-2 bg-dark-card hover:bg-dark-border border border-dark-border px-3.5 py-2 rounded-xl text-xs font-medium text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 bg-primary hover:bg-primary-hover px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-primary/25"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Connection</span>
          </button>
        </div>
      </div>

      {/* Main Active Connection String Card */}
      <div className="glass-card p-6 rounded-2xl space-y-6 border border-dark-border shadow-xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Master Connection URI
            </span>
            <h3 className="text-lg font-bold text-white">Primary Remote Signer Link</h3>
          </div>
          <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono">
            Full Granular Access
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            readOnly
            value={bunkerUri || 'Loading connection URI...'}
            className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-xs font-mono text-white focus:outline-none focus:border-primary"
          />
          <button
            onClick={() => bunkerUri && handleCopy(bunkerUri, 'master')}
            disabled={!bunkerUri}
            className="flex items-center space-x-2 bg-primary hover:bg-primary-hover px-4 py-3 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50 shrink-0"
          >
            {copiedId === 'master' ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            <span>{copiedId === 'master' ? 'Copied' : 'Copy URI'}</span>
          </button>
        </div>

        {/* QR Code */}
        <div className="bg-dark-bg/50 border border-dark-border rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h4 className="font-bold text-white flex items-center justify-center sm:justify-start gap-2">
              <QrCode className="w-5 h-5 text-accent-purple" />
              Dynamic Mobile Connect QR
            </h4>
            <p className="text-xs text-dark-muted max-w-md">
              Scan with Damus, Amethyst, or Primal to auto-configure NIP-46 remote signing without exposing private keys.
            </p>
          </div>
          <div className="shrink-0 flex items-center justify-center">
            {bunkerUri ? (
              <QRCodeSvg value={bunkerUri} size={150} />
            ) : (
              <div className="w-[150px] h-[150px] bg-dark-card border border-dark-border rounded-xl flex items-center justify-center text-xs text-dark-muted">
                Generating QR...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Created Connections List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white">Configured Client Connections</h3>

        {connections.length === 0 ? (
          <div className="glass-card p-8 rounded-2xl text-center text-dark-muted border border-dark-border">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-dark-muted/50" />
            <p className="text-sm">No custom client connections created yet.</p>
            <button
              onClick={openCreateModal}
              className="mt-3 inline-flex items-center space-x-2 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create your first client connection</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {connections.map((conn) => {
              const masterPubkey = bunkerUri?.split('://')[1]?.split('?')[0] || 'pubkey';
              const targetPubkey = conn.pubkey || (conn.nsec ? derivePubkeyFromNsec(conn.nsec, masterPubkey) : masterPubkey);
              const connUri = `bunker://${targetPubkey}?${conn.relays
                .split(',')
                .map((r) => `relay=${encodeURIComponent(r.trim())}`)
                .join('&')}`;

              const rulesList = conn.rules || [];

              return (
                <div
                  key={conn.id}
                  className="glass-card p-5 rounded-2xl border border-dark-border space-y-4 shadow-lg hover:border-dark-border/80"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-dark-border/60">
                    <div>
                      <h4 className="font-bold text-white text-base flex items-center gap-2">
                        {conn.name}
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-dark-muted border border-dark-border">
                          ID: {conn.id.slice(0, 8)}
                        </span>
                      </h4>
                      <p className="text-xs text-dark-muted font-mono mt-0.5">Relays: {conn.relays}</p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openEditModal(conn)}
                        className="p-2 rounded-lg bg-dark-bg hover:bg-slate-800 border border-dark-border text-dark-muted hover:text-white transition-colors"
                        title="Edit Connection"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingId(conn.id)}
                        className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition-colors"
                        title="Delete Connection"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Rules breakdown badge */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-dark-muted uppercase tracking-wider block">
                      Enforced Signing Rules
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {rulesList.length > 0 ? (
                        rulesList.slice(0, 6).map((r, idx) => (
                          <span
                            key={idx}
                            className={`text-[10px] px-2 py-0.5 rounded border inline-flex items-center space-x-1 ${
                              r.policy === 'allow'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            <span>
                              {r.policy === 'allow' ? '✓' : '✕'} {r.label || r.method}
                            </span>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] bg-primary/10 text-primary-light border border-primary/20 px-2 py-0.5 rounded">
                          ✓ Full Access (Default)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="space-y-1 bg-dark-bg/60 p-3 rounded-xl border border-dark-border/50">
                      <span className="text-dark-muted">Whitelisted Npub</span>
                      <p className="text-amber-300 font-semibold truncate">
                        {conn.whitelisted_npub || 'Any client connecting with URI'}
                      </p>
                    </div>

                    <div className="space-y-1 bg-dark-bg/60 p-3 rounded-xl border border-dark-border/50">
                      <span className="text-dark-muted">Expiration Policy</span>
                      <p className="text-indigo-300 font-semibold">
                        {conn.expiration === 0
                          ? 'Never Expires'
                          : new Date(conn.expiration * 1000).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={connUri}
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[11px] font-mono text-dark-muted focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopy(connUri, conn.id)}
                      className="bg-dark-card hover:bg-slate-800 border border-dark-border px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors flex items-center space-x-1 shrink-0"
                    >
                      {copiedId === conn.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === conn.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE CONNECTION MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl space-y-5 border border-dark-border shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-dark-border">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-light" />
                Create New Bunker Connection
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-dark-muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-dark-muted uppercase">Connection Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Damus Mobile App"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white font-sans focus:outline-none focus:border-primary"
                />
              </div>

              {/* Security & Permissions Presets */}
              <div className="space-y-2 pt-1 border-t border-dark-border/60">
                <label className="font-semibold text-white flex items-center justify-between">
                  <span>Granular Security & Permission Preset</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('social')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'social'
                        ? 'border-primary bg-primary/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 text-primary-light mb-1" />
                    <div className="text-xs font-semibold">Standard Social</div>
                    <div className="text-[10px] text-dark-muted">No DMs / Wallet</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('public_only')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'public_only'
                        ? 'border-amber-400 bg-amber-500/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 mb-1" />
                    <div className="text-xs font-semibold">Strict Public</div>
                    <div className="text-[10px] text-dark-muted">Posts Only</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('full')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'full'
                        ? 'border-emerald-400 bg-emerald-500/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-400 mb-1" />
                    <div className="text-xs font-semibold">Full Access</div>
                    <div className="text-[10px] text-dark-muted">Allow All</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('read_only')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'read_only'
                        ? 'border-sky-400 bg-sky-500/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5 text-sky-400 mb-1" />
                    <div className="text-xs font-semibold">Read & Encrypt</div>
                    <div className="text-[10px] text-dark-muted">No Posts</div>
                  </button>
                </div>

                {/* Fine-tune toggle button */}
                <button
                  type="button"
                  onClick={() => setShowAdvancedRules(!showAdvancedRules)}
                  className="inline-flex items-center space-x-1 text-[11px] text-primary-light hover:underline pt-1"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{showAdvancedRules ? 'Hide Fine-Tuning' : 'Customize Specific Rules'}</span>
                  {showAdvancedRules ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showAdvancedRules && (
                  <div className="space-y-1.5 p-3 rounded-xl border border-dark-border bg-dark-bg/60">
                    {[
                      { method: 'sign_event', kind: 1, name: 'Send Post (Kind 1)' },
                      { method: 'sign_event', kind: 0, name: 'Profile Update (Kind 0)' },
                      { method: 'sign_event', kind: 6, name: 'Repost (Kind 6)' },
                      { method: 'sign_event', kind: 7, name: 'Reaction (Kind 7)' },
                      { method: 'sign_event', kind: 44, name: 'Direct Message (NIP-44)' },
                      { method: 'sign_event', kind: 4, name: 'Legacy DM (NIP-04)' },
                      { method: 'sign_event', kind: 23194, name: 'Wallet Commands (NWC)' },
                      { method: 'nip44_encrypt', kind: null, name: 'Modern Encryption (NIP-44)' },
                    ].map((op) => {
                      const allowed = isRuleAllowed(op.method, op.kind);
                      return (
                        <div
                          key={`${op.method}-${op.kind}`}
                          className="flex items-center justify-between py-1 text-xs"
                        >
                          <span className="text-white">{op.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleFormRule(op.method, op.kind)}
                            className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border ${
                              allowed
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {allowed ? 'Allow' : 'Block'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-dark-muted uppercase">Nsec Key (Default: Logged-in Account)</label>
                <input
                  type="text"
                  value={formNsec}
                  onChange={(e) => setFormNsec(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-dark-muted uppercase">Expiration Preset</label>
                <select
                  value={formExpiration}
                  onChange={(e) => setFormExpiration(Number(e.target.value))}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary"
                >
                  <option value={0}>Never Expires</option>
                  <option value={Math.floor(Date.now() / 1000) + 3600}>1 Hour</option>
                  <option value={Math.floor(Date.now() / 1000) + 86400}>1 Day</option>
                  <option value={Math.floor(Date.now() / 1000) + 604800}>7 Days</option>
                  <option value={Math.floor(Date.now() / 1000) + 2592000}>30 Days</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-dark-muted uppercase">Whitelisted Npub (Optional)</label>
                <input
                  type="text"
                  placeholder="npub1... (Optional: locks URI to this specific client pubkey)"
                  value={formWhitelistedNpub}
                  onChange={(e) => setFormWhitelistedNpub(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-dark-muted uppercase">Relays (Comma Separated)</label>
                  {onFetchRelays && (
                    <button
                      type="button"
                      onClick={handleFetchUserRelays}
                      disabled={isFetchingRelays}
                      className="text-[11px] text-primary hover:underline flex items-center space-x-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isFetchingRelays ? 'animate-spin' : ''}`} />
                      <span>{isFetchingRelays ? 'Fetching...' : 'Fetch Network Relays'}</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={formRelays}
                  onChange={(e) => setFormRelays(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-dark-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-dark-card border border-dark-border text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold shadow-lg shadow-primary/25 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Save Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CONNECTION MODAL */}
      {editingConn && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 rounded-2xl space-y-5 border border-dark-border shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-dark-border">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary-light" />
                Edit Bunker Connection
              </h3>
              <button onClick={() => setEditingConn(null)} className="text-dark-muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-dark-muted uppercase">Connection Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary"
                />
              </div>

              {/* Security & Permissions Presets */}
              <div className="space-y-2 pt-1 border-t border-dark-border/60">
                <label className="font-semibold text-white flex items-center justify-between">
                  <span>Granular Security & Permission Preset</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('social')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'social'
                        ? 'border-primary bg-primary/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 text-primary-light mb-1" />
                    <div className="text-xs font-semibold">Standard Social</div>
                    <div className="text-[10px] text-dark-muted">No DMs / Wallet</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('public_only')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'public_only'
                        ? 'border-amber-400 bg-amber-500/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 mb-1" />
                    <div className="text-xs font-semibold">Strict Public</div>
                    <div className="text-[10px] text-dark-muted">Posts Only</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('full')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'full'
                        ? 'border-emerald-400 bg-emerald-500/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-400 mb-1" />
                    <div className="text-xs font-semibold">Full Access</div>
                    <div className="text-[10px] text-dark-muted">Allow All</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('read_only')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      formPreset === 'read_only'
                        ? 'border-sky-400 bg-sky-500/10 text-white'
                        : 'border-dark-border bg-dark-bg/40 text-dark-muted hover:text-white'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5 text-sky-400 mb-1" />
                    <div className="text-xs font-semibold">Read & Encrypt</div>
                    <div className="text-[10px] text-dark-muted">No Posts</div>
                  </button>
                </div>

                {/* Fine-tune toggle button */}
                <button
                  type="button"
                  onClick={() => setShowAdvancedRules(!showAdvancedRules)}
                  className="inline-flex items-center space-x-1 text-[11px] text-primary-light hover:underline pt-1"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{showAdvancedRules ? 'Hide Fine-Tuning' : 'Customize Specific Rules'}</span>
                  {showAdvancedRules ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showAdvancedRules && (
                  <div className="space-y-1.5 p-3 rounded-xl border border-dark-border bg-dark-bg/60">
                    {[
                      { method: 'sign_event', kind: 1, name: 'Send Post (Kind 1)' },
                      { method: 'sign_event', kind: 0, name: 'Profile Update (Kind 0)' },
                      { method: 'sign_event', kind: 6, name: 'Repost (Kind 6)' },
                      { method: 'sign_event', kind: 7, name: 'Reaction (Kind 7)' },
                      { method: 'sign_event', kind: 44, name: 'Direct Message (NIP-44)' },
                      { method: 'sign_event', kind: 4, name: 'Legacy DM (NIP-04)' },
                      { method: 'sign_event', kind: 23194, name: 'Wallet Commands (NWC)' },
                      { method: 'nip44_encrypt', kind: null, name: 'Modern Encryption (NIP-44)' },
                    ].map((op) => {
                      const allowed = isRuleAllowed(op.method, op.kind);
                      return (
                        <div
                          key={`${op.method}-${op.kind}`}
                          className="flex items-center justify-between py-1 text-xs"
                        >
                          <span className="text-white">{op.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleFormRule(op.method, op.kind)}
                            className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border ${
                              allowed
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {allowed ? 'Allow' : 'Block'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-dark-muted uppercase">Expiration Preset</label>
                <select
                  value={formExpiration}
                  onChange={(e) => setFormExpiration(Number(e.target.value))}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-primary"
                >
                  <option value={0}>Never Expires</option>
                  <option value={Math.floor(Date.now() / 1000) + 3600}>1 Hour</option>
                  <option value={Math.floor(Date.now() / 1000) + 86400}>1 Day</option>
                  <option value={Math.floor(Date.now() / 1000) + 604800}>7 Days</option>
                  <option value={Math.floor(Date.now() / 1000) + 2592000}>30 Days</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-dark-muted uppercase">Whitelisted Npub (Optional)</label>
                <input
                  type="text"
                  value={formWhitelistedNpub}
                  onChange={(e) => setFormWhitelistedNpub(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-dark-muted uppercase">Relays (Comma Separated)</label>
                  {onFetchRelays && (
                    <button
                      type="button"
                      onClick={handleFetchUserRelays}
                      disabled={isFetchingRelays}
                      className="text-[11px] text-primary hover:underline flex items-center space-x-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isFetchingRelays ? 'animate-spin' : ''}`} />
                      <span>{isFetchingRelays ? 'Fetching...' : 'Fetch Network Relays'}</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={formRelays}
                  onChange={(e) => setFormRelays(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-dark-border">
                <button
                  type="button"
                  onClick={() => setEditingConn(null)}
                  className="px-4 py-2 rounded-xl bg-dark-card border border-dark-border text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold shadow-lg shadow-primary/25 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Update Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 rounded-2xl space-y-4 border border-dark-border text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white">Delete Connection?</h4>
            <p className="text-xs text-dark-muted">
              Are you sure you want to delete this connection profile? Any client configured with this URI will lose
              remote signing access.
            </p>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 rounded-xl bg-dark-card border border-dark-border text-white hover:bg-slate-800 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
