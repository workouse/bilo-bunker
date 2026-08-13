import React, { useState } from 'react';
import { User, Copy, Check, ShieldCheck, Key, Globe, Sparkles } from 'lucide-react';
import { NostrProfile } from '../hooks/useNostrAuth';

interface UserProfilePageProps {
  pubkey: string;
  npub: string | null;
  profile: NostrProfile | null;
  bunkerPubkey?: string;
}

export const UserProfilePage: React.FC<UserProfilePageProps> = ({
  pubkey,
  npub,
  profile,
  bunkerPubkey,
}) => {
  const [copiedKey, setCopiedKey] = useState<'npub' | 'hex' | null>(null);

  const handleCopy = (text: string, type: 'npub' | 'hex') => {
    navigator.clipboard.writeText(text);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const displayName = profile?.display_name || profile?.name || profile?.username || (npub ? `${npub.slice(0, 14)}...${npub.slice(-6)}` : 'Nostr Sovereign');
  const username = profile?.name || profile?.username || null;
  const nip05 = profile?.nip05 || null;
  const about = profile?.about || null;

  return (
    <div className="space-y-6 max-w-4xl font-sans">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <span>Nostr User Profile</span>
          <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-mono font-medium">
            Readonly
          </span>
        </h2>
        <p className="text-sm text-dark-muted">Verified NIP-07 account identity &amp; edge Bunker binding state</p>
      </div>

      {/* Profile Card Header */}
      <div className="glass-card rounded-2xl overflow-hidden border border-dark-border shadow-xl">
        {/* Cover Graphic */}
        <div className="h-32 bg-gradient-to-r from-primary/30 via-accent-purple/30 to-slate-900 border-b border-dark-border relative">
          <div className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>DO Tenant Active</span>
          </div>
        </div>

        {/* Profile Details Header */}
        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between -mt-12 mb-4 gap-4">
            <div className="flex items-end space-x-4">
              {profile?.picture ? (
                <img
                  src={profile.picture}
                  alt={displayName}
                  className="w-24 h-24 rounded-2xl object-cover border-4 border-dark-bg shadow-2xl bg-dark-card"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-dark-card border-4 border-dark-bg flex items-center justify-center text-primary shadow-2xl">
                  <User className="w-10 h-10" />
                </div>
              )}
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2 font-mono">
                  {displayName}
                  {nip05 && <ShieldCheck className="w-5 h-5 text-accent-emerald" />}
                </h3>
                {username && <p className="text-xs text-dark-muted font-mono">@{username}</p>}
              </div>
            </div>

            {nip05 && (
              <div className="flex items-center space-x-2 text-xs text-dark-muted font-mono bg-dark-bg/80 border border-dark-border px-3 py-2 rounded-xl">
                <Globe className="w-4 h-4 text-primary" />
                <span>{nip05}</span>
              </div>
            )}
          </div>

          {about && (
            <p className="text-sm text-dark-muted leading-relaxed mb-6 bg-dark-bg/40 p-4 rounded-xl border border-dark-border/50">
              {about}
            </p>
          )}

          {/* Keypair Section */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-accent-purple" />
              Public Keys &amp; Cryptographic Identity
            </h4>

            {/* Npub */}
            <div className="space-y-1">
              <label className="text-[11px] text-dark-muted font-mono uppercase">Npub (NIP-19 Format)</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={npub || ''}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none"
                />
                <button
                  onClick={() => npub && handleCopy(npub, 'npub')}
                  className="bg-dark-card hover:bg-slate-800 border border-dark-border px-3.5 py-2.5 rounded-lg text-xs font-medium text-white transition-colors flex items-center space-x-1.5 shrink-0"
                >
                  {copiedKey === 'npub' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'npub' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Hex Pubkey */}
            <div className="space-y-1">
              <label className="text-[11px] text-dark-muted font-mono uppercase">Hex Public Key</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={pubkey}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none"
                />
                <button
                  onClick={() => handleCopy(pubkey, 'hex')}
                  className="bg-dark-card hover:bg-slate-800 border border-dark-border px-3.5 py-2.5 rounded-lg text-xs font-medium text-white transition-colors flex items-center space-x-1.5 shrink-0"
                >
                  {copiedKey === 'hex' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'hex' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edge DO Tenant Info */}
      <div className="glass-card p-6 rounded-2xl border border-dark-border space-y-4">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Cloudflare Durable Object Tenant Status
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="bg-dark-bg p-3.5 rounded-xl border border-dark-border space-y-1">
            <span className="text-dark-muted">DO Instance ID</span>
            <p className="text-white truncate font-semibold">{pubkey.slice(0, 16)}...</p>
          </div>
          <div className="bg-dark-bg p-3.5 rounded-xl border border-dark-border space-y-1">
            <span className="text-dark-muted">Master Bunker Pubkey</span>
            <p className="text-emerald-400 truncate font-semibold">{bunkerPubkey || 'Active'}</p>
          </div>
          <div className="bg-dark-bg p-3.5 rounded-xl border border-dark-border space-y-1">
            <span className="text-dark-muted">Isolation Tier</span>
            <p className="text-indigo-400 font-semibold">SQLite Per-DO Sandbox</p>
          </div>
        </div>
      </div>
    </div>
  );
};
