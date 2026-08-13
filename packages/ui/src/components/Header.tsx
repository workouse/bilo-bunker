import React from 'react';
import { ShieldCheck, LogOut, User } from 'lucide-react';
import { NostrProfile } from '../hooks/useNostrAuth';

interface HeaderProps {
  npub: string | null;
  profile?: NostrProfile | null;
  onLogout: () => void;
  onGoToLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ npub, profile, onLogout, onGoToLanding }) => {
  const hasCustomName = Boolean(profile?.display_name || profile?.name || profile?.username);
  const displayName = profile?.display_name || profile?.name || profile?.username || (npub ? `${npub.slice(0, 10)}...${npub.slice(-4)}` : '');

  return (
    <header className="glass-card sticky top-0 z-50 border-b border-dark-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="bg-primary/20 p-2 rounded-lg text-primary cursor-pointer" onClick={onGoToLanding}>
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-white flex items-center gap-2">
            Bilo Bunker
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              Edge Active
            </span>
          </h1>
          <p className="text-xs text-dark-muted">NIP-46 Multi-Tenant Remote Signer</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {onGoToLanding && (
          <button
            onClick={onGoToLanding}
            className="text-xs text-dark-muted hover:text-white bg-slate-800/80 border border-dark-border px-3 py-1.5 rounded-lg transition-colors"
          >
            Landing Page
          </button>
        )}
        {npub && (
          <>
            <div className="flex items-center space-x-2.5 bg-dark-bg border border-dark-border px-3 py-1.5 rounded-xl text-xs text-white shadow-sm">
              {profile?.picture ? (
                <img
                  src={profile.picture}
                  alt={displayName}
                  className="w-5 h-5 rounded-full object-cover border border-primary/40 shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <User className="w-3 h-3" />
                </div>
              )}
              <div className="flex flex-col text-left">
                <span className="font-bold text-white leading-none font-mono">{displayName}</span>
                {hasCustomName && profile?.name && (
                  <span className="text-[10px] text-dark-muted font-mono leading-tight">@{profile.name}</span>
                )}
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};
