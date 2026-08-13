import React from 'react';
import { Cpu, Database, Cloud, ShieldCheck, Key, RefreshCw } from 'lucide-react';

export const CloudflareFeatures: React.FC = () => {
  const features = [
    {
      icon: Cpu,
      title: 'Cloudflare Workers (Hono)',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      description:
        'Ultra-fast Hono router deployed across 300+ global edge locations for sub-millisecond API responses and static asset serving.',
    },
    {
      icon: Database,
      title: 'Durable Objects & SQLite',
      color: 'text-primary-light',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
      description:
        'Each Nostr user gets a dedicated, isolated Durable Object with an embedded SQLite engine for stateful RPC logging and client management.',
    },
    {
      icon: Cloud,
      title: 'Cloudflare KV Namespace',
      color: 'text-accent-purple',
      bgColor: 'bg-accent-purple/10',
      borderColor: 'border-accent-purple/20',
      description:
        'Global low-latency storage for user profile metadata, public keys, and high-frequency configuration lookups.',
    },
    {
      icon: ShieldCheck,
      title: 'NIP-98 HTTP Auth',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      description:
        'Zero-trust HTTP header authentication signed via NIP-07 browser extensions with a strict ±60s replay protection window.',
    },
    {
      icon: Key,
      title: 'NIP-46 & NIP-44 v2 Crypto',
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/20',
      description:
        'Secp256k1 ECDH shared secret derivation for end-to-end encrypted remote signing across Nostr relay pools.',
    },
    {
      icon: RefreshCw,
      title: 'Auto-Healing WS Pool',
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
      description:
        'Durable Objects maintain resilient, persistent WebSocket client connections to Nostr relays with exponential backoff.',
    },
  ];

  return (
    <section className="py-20 bg-dark-bg relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Built for Cloudflare Edge Infrastructure
          </h2>
          <p className="text-dark-muted text-base sm:text-lg">
            Leveraging state-of-the-art serverless primitives to deliver high-performance, fault-tolerant Nostr remote key management.
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
