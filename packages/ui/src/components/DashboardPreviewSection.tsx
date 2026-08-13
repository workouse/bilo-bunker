import React, { useState } from 'react';
import { LayoutDashboard, Link2, ShieldCheck, Activity, CheckCircle2 } from 'lucide-react';

interface TabItem {
  id: 'overview' | 'bunker_uris' | 'permissions' | 'audit_logs';
  label: string;
  badge: string;
  icon: React.ElementType;
  image: string;
  description: string;
  highlights: string[];
}

export const DashboardPreviewSection: React.FC = () => {
  const tabs: TabItem[] = [
    {
      id: 'overview',
      label: 'System Overview',
      badge: 'Real-Time Status',
      icon: LayoutDashboard,
      image: '/screenshots/overview.png',
      description: 'At-a-glance status of authorized client applications, RPC signing request counters, SQLite encryption, and Node.js container health.',
      highlights: ['Active client counters', 'Real-time RPC execution metrics', 'SQLite encrypted keypair status', 'Node.js 22 container engine health'],
    },
    {
      id: 'bunker_uris',
      label: 'Bunker URIs & QR',
      badge: 'NIP-46 Connect',
      icon: Link2,
      image: '/screenshots/bunker-uris.png',
      description: 'Generate master NIP-46 remote signing links, dynamic mobile QR codes for Damus/Amethyst/Primal, and configure per-client relay policies.',
      highlights: ['Master bunker:// URI link', 'Dynamic mobile connect QR code', 'Whitelisted npub sign restrictions', 'Custom relay pool definitions'],
    },
    {
      id: 'permissions',
      label: 'App Permissions',
      badge: 'Access Control',
      icon: ShieldCheck,
      image: '/screenshots/app-permissions.png',
      description: 'Review granted NIP-46 permissions for external Nostr applications with instant single-click authorization revocation.',
      highlights: ['Client pubkey authorization table', 'Granted NIP-46 method lists', 'Last active timestamp tracking', 'Instant access revocation'],
    },
    {
      id: 'audit_logs',
      label: 'Security Audit Logs',
      badge: 'Cryptographic Trail',
      icon: Activity,
      image: '/screenshots/audit-logs.png',
      description: 'Real-time cryptographic audit trail of all signing requests and RPC operations executed on your bunker instance.',
      highlights: ['Live execution log stream', 'RPC method & status filtering', 'Search by pubkey or parameters', 'Deep JSON payload inspection'],
    },
  ];

  const [activeTab, setActiveTab] = useState<'overview' | 'bunker_uris' | 'permissions' | 'audit_logs'>('overview');

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <section className="py-20 bg-slate-900/50 border-t border-dark-border/50 relative overflow-hidden font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>NIP-07 TailAdmin Dashboard</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Full Control Over Your Remote Signer
          </h2>
          <p className="text-dark-muted text-base sm:text-lg leading-relaxed">
            Inspect live RPC logs, manage connection URIs, generate QR codes, and revoke client application permissions—all through a self-sovereign web interface.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 bg-slate-900/80 rounded-2xl border border-dark-border max-w-3xl mx-auto shadow-lg">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'text-dark-muted hover:text-white hover:bg-dark-card'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Window Frame with Screenshot */}
        <div className="glass-card rounded-2xl border border-dark-border overflow-hidden shadow-2xl space-y-0">
          {/* Mac-Style Window Top Bar */}
          <div className="bg-slate-950 px-4 py-3 border-b border-dark-border/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="text-xs font-mono text-dark-muted ml-3 hidden sm:inline-block">
                bilo-bunker dashboard — {currentTab.label}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {currentTab.badge}
              </span>
            </div>
          </div>

          {/* Screenshot Preview Display */}
          <div className="p-3 sm:p-6 bg-slate-950/90 relative group">
            <img
              src={currentTab.image}
              alt={currentTab.label}
              className="w-full h-auto rounded-xl border border-dark-border/80 shadow-2xl object-cover transition-opacity duration-300"
            />
          </div>

          {/* Tab Information Footer */}
          <div className="bg-slate-900/80 p-6 border-t border-dark-border/60 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed max-w-4xl">
              {currentTab.description}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {currentTab.highlights.map((highlight, idx) => (
                <div
                  key={idx}
                  className="flex items-center space-x-2 text-xs font-mono text-emerald-400 bg-dark-bg/60 px-3 py-2 rounded-lg border border-dark-border/50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">{highlight}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
