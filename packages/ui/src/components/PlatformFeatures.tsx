import React from 'react';
import { Container, ShieldCheck, Database, Key, Radio, RefreshCw } from 'lucide-react';

export const PlatformFeatures: React.FC = () => {
  const features = [
    {
      icon: Container,
      title: 'Docker & Docker Compose',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      description:
        'Lightweight Node.js 22 container stack with volume-persisted SQLite database and automated container health checks.',
    },
    {
      icon: ShieldCheck,
      title: 'Caddy Reverse Proxy & Auto-SSL',
      color: 'text-primary-light',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
      description:
        'Zero-config HTTPS with automatic Let\'s Encrypt & ZeroSSL TLS certificate issuance, HTTP/2, and HTTP/3 support.',
    },
    {
      icon: Database,
      title: 'SQLite Database Engine',
      color: 'text-accent-purple',
      bgColor: 'bg-accent-purple/10',
      borderColor: 'border-accent-purple/20',
      description:
        'High-performance SQLite database with WAL mode enabled for stateful RPC logging, client authorizations, and keypair storage.',
    },
    {
      icon: Key,
      title: 'NIP-98 HTTP Auth',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      description:
        'Zero-trust HTTP header authentication signed via NIP-07 browser extensions with a strict ±60s replay protection window.',
    },
    {
      icon: Radio,
      title: 'NIP-46 & NIP-44 v2 Crypto',
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20',
      description:
        'Secp256k1 ECDH shared secret derivation for end-to-end encrypted remote signing across Nostr relay pools.',
    },
    {
      icon: RefreshCw,
      title: 'Auto-Healing WS Relay Pool',
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
      description:
        'Maintains resilient, persistent WebSocket client connections to Nostr relays with exponential backoff and status monitoring.',
    },
  ];

  return (
    <section className="py-20 bg-dark-bg relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Built for Self-Hosted Docker &amp; Caddy Infrastructure
          </h2>
          <p className="text-dark-muted text-base sm:text-lg">
            Leveraging production-ready container primitives and reverse-proxy automation to deliver high-performance, fault-tolerant Nostr remote key management.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl glass-card border border-dark-border hover:border-slate-600/80 transition-all duration-300 group hover:-translate-y-1"
              >
                <div className={`w-12 h-12 rounded-xl ${item.bgColor} border ${item.borderColor} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-dark-muted leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
