import React from 'react';
import { Activity, ShieldCheck, Key, Cpu } from 'lucide-react';

interface OverviewPageProps {
  bunkerPubkey?: string;
  clientCount: number;
  logCount: number;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ bunkerPubkey, clientCount, logCount }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">System Dashboard Overview</h2>
        <p className="text-sm text-dark-muted">Real-time status of your self-hosted Bunker instance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-dark-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Authorized Apps</span>
            <ShieldCheck className="w-5 h-5 text-accent-emerald" />
          </div>
          <p className="text-3xl font-bold text-white">{clientCount}</p>
          <span className="text-xs text-emerald-400">Connected clients</span>
        </div>

        <div className="glass-card p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-dark-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">RPC Execution Logs</span>
            <Activity className="w-5 h-5 text-accent-purple" />
          </div>
          <p className="text-3xl font-bold text-white">{logCount}</p>
          <span className="text-xs text-purple-400">Audited signing requests</span>
        </div>

        <div className="glass-card p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-dark-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Bunker Keypair</span>
            <Key className="w-5 h-5 text-primary-light" />
          </div>
          <p className="text-sm font-mono text-white truncate">{bunkerPubkey || 'Generating...'}</p>
          <span className="text-xs text-indigo-400">SQLite Encrypted</span>
        </div>

        <div className="glass-card p-5 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-dark-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Server Architecture</span>
            <Cpu className="w-5 h-5 text-accent-amber" />
          </div>
          <p className="text-3xl font-bold text-white">Node.js 22</p>
          <span className="text-xs text-amber-400">Docker Container Engine</span>
        </div>
      </div>

      <div className="glass-card p-6 rounded-xl space-y-4 border border-dark-border">
        <h3 className="text-lg font-bold text-white">Remote Signer Security Guarantee</h3>
        <p className="text-sm text-dark-muted leading-relaxed">
          Your Nostr private keys are statefully stored inside an isolated SQLite database.
          No raw private keys ever leave the signer process. All remote client requests are authenticated via NIP-46, encrypted with NIP-44 v2, and audited in your real-time log stream.
        </p>
      </div>
    </div>
  );
};
