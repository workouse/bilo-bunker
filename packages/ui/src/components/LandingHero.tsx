import React from 'react';
import { ShieldCheck, Zap, Github, ArrowRight, Lock, Server } from 'lucide-react';
import { getDomainConfig } from '../config/domains';

interface LandingHeroProps {
  onLaunchDashboard: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onLaunchDashboard }) => {
  const domains = getDomainConfig();

  return (
    <div className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-accent-purple/15 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Top Domain & Homage Badges */}
        <div className="inline-flex flex-wrap items-center justify-center gap-2 mb-8">
          <span className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/30 font-mono">
            <Server className="w-3.5 h-3.5" />
            <span>app.bunker-bilo.workouse.com</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-accent-purple/10 text-accent-purple border border-accent-purple/30">
            <Lock className="w-3.5 h-3.5" />
            <span>Nostr NIP-46 Remote Signer</span>
          </span>
          <span className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Zap className="w-3.5 h-3.5" />
            <span>100% Open Source (MIT)</span>
          </span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.15]">
          Be the <span className="bg-gradient-to-r from-primary via-accent-purple to-emerald-400 bg-clip-text text-transparent">Banker Bilo</span> of Your Nostr Identity
        </h1>

        {/* Subtitle & Value Proposition */}
        <p className="max-w-3xl mx-auto text-lg sm:text-xl text-dark-muted mb-10 leading-relaxed">
          An edge-native, stateful Nostr NIP-46 Remote Signer built on Cloudflare Workers &amp; Durable Objects.
          Keep your private keys isolated in per-user SQLite containers with zero server maintenance and complete self-sovereignty.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <button
            onClick={onLaunchDashboard}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-4 rounded-xl font-semibold text-white bg-primary hover:bg-primary-hover transition-all duration-200 shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5"
          >
            <ShieldCheck className="w-5 h-5" />
            <span>Launch Admin Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <a
            href="https://github.com/workouse/bilo-bunker"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-4 rounded-xl font-semibold text-dark-text bg-dark-card hover:bg-slate-700/80 border border-dark-border transition-all duration-200 hover:-translate-y-0.5"
          >
            <Github className="w-5 h-5" />
            <span>View Source on GitHub</span>
          </a>
        </div>

        {/* Domain Strip */}
        <div className="mb-10 text-xs font-mono text-dark-muted flex flex-wrap items-center justify-center gap-4 bg-slate-900/60 p-3 rounded-xl border border-dark-border/60 max-w-2xl mx-auto">
          <div><span className="text-dark-muted">Dashboard:</span> <span className="text-white">{domains.dashboardUrl}</span></div>
          <div><span className="text-dark-muted">API:</span> <span className="text-emerald-400">{domains.apiUrl}</span></div>
        </div>

        {/* Quick Highlights Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-6 border-t border-dark-border/60 text-left">
          <div className="p-4 rounded-xl glass-card">
            <div className="text-2xl font-bold text-white mb-1">Zero-Trust</div>
            <div className="text-xs text-dark-muted">NIP-98 &amp; NIP-44 v2 Auth</div>
          </div>
          <div className="p-4 rounded-xl glass-card">
            <div className="text-2xl font-bold text-emerald-400 mb-1">0 ms Cold Start</div>
            <div className="text-xs text-dark-muted">Cloudflare Workers Edge</div>
          </div>
          <div className="p-4 rounded-xl glass-card">
            <div className="text-2xl font-bold text-accent-purple mb-1">SQLite / DO</div>
            <div className="text-xs text-dark-muted">Isolated Stateful Storage</div>
          </div>
          <div className="p-4 rounded-xl glass-card">
            <div className="text-2xl font-bold text-amber-400 mb-1">1 Command</div>
            <div className="text-xs text-dark-muted">`make deploy` publish</div>
          </div>
        </div>
      </div>
    </div>
  );
};
