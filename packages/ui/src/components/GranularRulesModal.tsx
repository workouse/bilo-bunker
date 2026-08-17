import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Lock,
  Globe,
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export type PermissionPolicy = 'allow' | 'block';

export interface GranularRule {
  method: string;
  kind?: number | null;
  policy: PermissionPolicy;
  label?: string;
}

interface GranularRulesModalProps {
  isOpen: boolean;
  clientPubkey: string;
  initialRules: GranularRule[];
  onClose: () => void;
  onSave: (clientPubkey: string, rules: GranularRule[]) => Promise<void>;
  onReset: (clientPubkey: string) => Promise<void>;
}

interface StandardOperation {
  id: string;
  method: string;
  kind?: number | null;
  name: string;
  description: string;
  category: 'social' | 'messages' | 'wallet' | 'crypto' | 'system';
}

const STANDARD_OPERATIONS: StandardOperation[] = [
  {
    id: 'sign_1',
    method: 'sign_event',
    kind: 1,
    name: 'Send Post',
    description: 'Publish short public notes & posts (Kind 1)',
    category: 'social',
  },
  {
    id: 'sign_0',
    method: 'sign_event',
    kind: 0,
    name: 'Profile Update',
    description: 'Update profile metadata, bio, avatar (Kind 0)',
    category: 'social',
  },
  {
    id: 'sign_6',
    method: 'sign_event',
    kind: 6,
    name: 'Repost',
    description: 'Repost other users notes (Kind 6)',
    category: 'social',
  },
  {
    id: 'sign_7',
    method: 'sign_event',
    kind: 7,
    name: 'Reaction',
    description: 'Like, emoji reaction (Kind 7)',
    category: 'social',
  },
  {
    id: 'sign_3',
    method: 'sign_event',
    kind: 3,
    name: 'Follows & Contacts',
    description: 'Update following contact list (Kind 3)',
    category: 'social',
  },
  {
    id: 'sign_10002',
    method: 'sign_event',
    kind: 10002,
    name: 'Relay List',
    description: 'Manage advertised personal relays (Kind 10002)',
    category: 'social',
  },
  {
    id: 'sign_44',
    method: 'sign_event',
    kind: 44,
    name: 'Direct Message (NIP-44)',
    description: 'Send encrypted direct messages (Kind 44 / NIP-17)',
    category: 'messages',
  },
  {
    id: 'sign_4',
    method: 'sign_event',
    kind: 4,
    name: 'Legacy DM (NIP-04)',
    description: 'Send legacy encrypted direct messages (Kind 4)',
    category: 'messages',
  },
  {
    id: 'sign_23194',
    method: 'sign_event',
    kind: 23194,
    name: 'Wallet Commands (NWC)',
    description: 'Authorize Nostr Wallet Connect payments (Kind 23194)',
    category: 'wallet',
  },
  {
    id: 'sign_7375',
    method: 'sign_event',
    kind: 7375,
    name: 'Zap / Payment Request',
    description: 'Create lightning zap / payment requests (Kind 7375)',
    category: 'wallet',
  },
  {
    id: 'nip44_encrypt',
    method: 'nip44_encrypt',
    kind: null,
    name: 'Modern Encryption (NIP-44)',
    description: 'Encrypt payloads using NIP-44 v2 cipher',
    category: 'crypto',
  },
  {
    id: 'nip44_decrypt',
    method: 'nip44_decrypt',
    kind: null,
    name: 'Modern Decryption (NIP-44)',
    description: 'Decrypt payloads using NIP-44 v2 cipher',
    category: 'crypto',
  },
  {
    id: 'nip04_encrypt',
    method: 'nip04_encrypt',
    kind: null,
    name: 'Legacy DM Encryption (NIP-04)',
    description: 'Encrypt payloads using legacy NIP-04 cipher',
    category: 'crypto',
  },
  {
    id: 'nip04_decrypt',
    method: 'nip04_decrypt',
    kind: null,
    name: 'Legacy DM Decryption (NIP-04)',
    description: 'Decrypt payloads using legacy NIP-04 cipher',
    category: 'crypto',
  },
  {
    id: 'get_public_key',
    method: 'get_public_key',
    kind: null,
    name: 'Read Public Key',
    description: 'Read the bunker identity public key',
    category: 'system',
  },
  {
    id: 'ping',
    method: 'ping',
    kind: null,
    name: 'Ping Check',
    description: 'Liveness health check response',
    category: 'system',
  },
];

export const GranularRulesModal: React.FC<GranularRulesModalProps> = ({
  isOpen,
  clientPubkey,
  initialRules,
  onClose,
  onSave,
  onReset,
}) => {
  const [rules, setRules] = useState<GranularRule[]>([]);
  const [customKind, setCustomKind] = useState<string>('');
  const [customPolicy, setCustomPolicy] = useState<PermissionPolicy>('allow');
  const [isSaving, setIsSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      if (initialRules && initialRules.length > 0) {
        setRules(initialRules);
      } else {
        // Default to standard social preset if no rules exist yet
        applyPreset('social');
      }
    }
  }, [isOpen, initialRules]);

  if (!isOpen) return null;

  const findRulePolicy = (method: string, kind?: number | null): PermissionPolicy => {
    const exact = rules.find((r) => r.method === method && r.kind === (kind ?? null));
    if (exact) return exact.policy;

    const methodWildcard = rules.find(
      (r) => r.method === method && (r.kind === null || r.kind === undefined)
    );
    if (methodWildcard) return methodWildcard.policy;

    const global = rules.find((r) => r.method === '*');
    if (global) return global.policy;

    return 'allow';
  };

  const togglePolicy = (method: string, kind?: number | null) => {
    const current = findRulePolicy(method, kind);
    const next: PermissionPolicy = current === 'allow' ? 'block' : 'allow';

    setRules((prev) => {
      const filtered = prev.filter(
        (r) => !(r.method === method && r.kind === (kind ?? null))
      );
      return [...filtered, { method, kind: kind ?? null, policy: next }];
    });
  };

  const applyPreset = (preset: 'social' | 'public_only' | 'full' | 'read_only') => {
    switch (preset) {
      case 'social':
        setRules([
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
          { method: 'nip04_encrypt', kind: null, policy: 'block' },
          { method: 'nip04_decrypt', kind: null, policy: 'block' },
          { method: 'get_public_key', kind: null, policy: 'allow' },
          { method: 'ping', kind: null, policy: 'allow' },
        ]);
        break;
      case 'public_only':
        setRules([
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
        ]);
        break;
      case 'full':
        setRules([{ method: '*', kind: null, policy: 'allow' }]);
        break;
      case 'read_only':
        setRules([
          { method: 'get_public_key', kind: null, policy: 'allow' },
          { method: 'ping', kind: null, policy: 'allow' },
          { method: 'nip44_encrypt', kind: null, policy: 'allow' },
          { method: 'nip44_decrypt', kind: null, policy: 'allow' },
          { method: 'sign_event', kind: null, policy: 'block' },
        ]);
        break;
    }
  };

  const handleAddCustomKind = () => {
    const kindNum = parseInt(customKind.trim(), 10);
    if (isNaN(kindNum) || kindNum < 0) return;

    setRules((prev) => {
      const filtered = prev.filter(
        (r) => !(r.method === 'sign_event' && r.kind === kindNum)
      );
      return [
        ...filtered,
        { method: 'sign_event', kind: kindNum, policy: customPolicy },
      ];
    });

    setCustomKind('');
  };

  const handleRemoveRule = (method: string, kind?: number | null) => {
    setRules((prev) =>
      prev.filter((r) => !(r.method === method && r.kind === (kind ?? null)))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(clientPubkey, rules);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      window.confirm(
        'Reset all granular rules for this client? It will revert to full access baseline.'
      )
    ) {
      setIsSaving(true);
      try {
        await onReset(clientPubkey);
        onClose();
      } finally {
        setIsSaving(false);
      }
    }
  };

  const customRules = rules.filter((r) => {
    if (r.method === '*') return false;
    return !STANDARD_OPERATIONS.some(
      (op) => op.method === r.method && op.kind === r.kind
    );
  });

  const filteredOperations =
    activeCategory === 'all'
      ? STANDARD_OPERATIONS
      : STANDARD_OPERATIONS.filter((op) => op.category === activeCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-dark-border flex items-center justify-between bg-dark-bg/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary-light">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Granular Signing Rules
              </h3>
              <p className="text-xs text-dark-muted font-mono mt-0.5">
                Client: {clientPubkey.slice(0, 16)}...{clientPubkey.slice(-10)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-dark-muted hover:text-white hover:bg-dark-border/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Quick Presets Bar */}
          <div>
            <label className="text-xs font-semibold text-dark-muted uppercase tracking-wider block mb-2.5">
              Quick Rule Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => applyPreset('social')}
                className="flex items-center space-x-2.5 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left group"
              >
                <Globe className="w-4 h-4 text-primary-light flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Standard Social</div>
                  <div className="text-[10px] text-dark-muted">Allow Posts, Block DMs & Wallet</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('public_only')}
                className="flex items-center space-x-2.5 p-3 rounded-xl border border-dark-border bg-dark-bg/40 hover:bg-dark-card transition-all text-left"
              >
                <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Strict Public</div>
                  <div className="text-[10px] text-dark-muted">Allow Posts, Block Crypto/DMs</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('full')}
                className="flex items-center space-x-2.5 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all text-left"
              >
                <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Full Access</div>
                  <div className="text-[10px] text-dark-muted">Allow all Nostr methods</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('read_only')}
                className="flex items-center space-x-2.5 p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 transition-all text-left"
              >
                <Lock className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Read & Encrypt</div>
                  <div className="text-[10px] text-dark-muted">No public signing allowed</div>
                </div>
              </button>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center space-x-1.5 border-b border-dark-border pb-3">
            {[
              { id: 'all', label: 'All Operations' },
              { id: 'social', label: 'Social & Feed' },
              { id: 'messages', label: 'Direct Messages' },
              { id: 'wallet', label: 'Wallet & Zaps' },
              { id: 'crypto', label: 'Encryption' },
              { id: 'system', label: 'System' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeCategory === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-dark-muted hover:text-white hover:bg-dark-bg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Standard Rules Grid */}
          <div className="space-y-2">
            {filteredOperations.map((op) => {
              const policy = findRulePolicy(op.method, op.kind);
              const isAllowed = policy === 'allow';

              return (
                <div
                  key={op.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-dark-border bg-dark-bg/40 hover:bg-dark-bg/80 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-white">{op.name}</span>
                      {op.kind !== null && op.kind !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-dark-card border border-dark-border text-dark-muted">
                          Kind {op.kind}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-dark-muted">{op.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => togglePolicy(op.method, op.kind)}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isAllowed
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                    }`}
                  >
                    {isAllowed ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Allowed</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>Blocked</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Custom Kind Rules */}
          {customRules.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-dark-border">
              <label className="text-xs font-semibold text-dark-muted uppercase tracking-wider block">
                Custom Configured Event Kinds
              </label>
              {customRules.map((rule) => {
                const isAllowed = rule.policy === 'allow';
                return (
                  <div
                    key={`${rule.method}-${rule.kind}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-dark-border bg-dark-bg/40"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-white">
                        {rule.label || `${rule.method} (Kind ${rule.kind})`}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-dark-card border border-dark-border text-dark-muted">
                        Kind {rule.kind}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => togglePolicy(rule.method, rule.kind)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium ${
                          isAllowed
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {isAllowed ? 'Allowed' : 'Blocked'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(rule.method, rule.kind)}
                        className="p-1.5 text-dark-muted hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Custom Kind Row */}
          <div className="p-4 rounded-xl border border-dark-border/60 bg-dark-bg/20 space-y-3">
            <label className="text-xs font-semibold text-white flex items-center space-x-1.5">
              <Plus className="w-3.5 h-3.5 text-primary-light" />
              <span>Add Custom Nostr Event Kind Rule</span>
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="0"
                max="65535"
                placeholder="e.g. 30023 (Long-form post)"
                value={customKind}
                onChange={(e) => setCustomKind(e.target.value)}
                className="flex-1 bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
              />
              <select
                value={customPolicy}
                onChange={(e) => setCustomPolicy(e.target.value as PermissionPolicy)}
                className="bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
              >
                <option value="allow">Allow</option>
                <option value="block">Block</option>
              </select>
              <button
                type="button"
                onClick={handleAddCustomKind}
                disabled={!customKind.trim()}
                className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                Add Rule
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dark-border bg-dark-bg/60 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="text-xs text-dark-muted hover:text-rose-400 transition-colors"
          >
            Reset to Default
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-dark-border text-xs font-medium text-dark-muted hover:text-white hover:bg-dark-border/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-semibold shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center space-x-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Rules'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
