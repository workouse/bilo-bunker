import React from 'react';
import { ArrowRight, Lock, Database, Radio, Server, CheckCircle2 } from 'lucide-react';

export const ArchitectureSection: React.FC = () => {
  const steps = [
    {
      title: '1. NIP-46 Client Request',
      subtitle: 'Nostr App (Amethyst, Damus, Coracle)',
      description: 'Client application issues encrypted NIP-46 RPC request (Kind 24133 event) with method sign_event.',
      icon: Radio,
      badge: 'Kind 24133',
    },
    {
      title: '2. Caddy TLS & Hono Gateway',
      subtitle: 'Auto-SSL & Reverse Proxy',
      description: 'Terminates TLS with automatic Let\'s Encrypt certificates and routes requests to the Node.js Hono container engine.',
      icon: Server,
      badge: 'Caddy + Hono',
    },
    {
      title: '3. Isolated Bunker Engine',
      subtitle: 'SQLite + Secp256k1',
      description: 'Decrypts NIP-44 payload, verifies client whitelist in SQLite, computes Schnorr signature, and logs execution audit.',
      icon: Database,
      badge: 'SQLite Store',
    },
    {
      title: '4. Encrypted Response',
      subtitle: 'Nostr Relay Client Pool',
      description: 'Dispatches signed Nostr event response encrypted back to client over resilient relay WebSockets.',
      icon: Lock,
      badge: 'Secp256k1',
    },
  ];

  return (
    <section className="py-20 bg-dark-bg relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Zero-Trust Containerized Signing Architecture
          </h2>
          <p className="text-dark-muted text-base sm:text-lg">
            How Bilo Bunker isolates private keys and executes NIP-46 RPC requests in a self-hosted environment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="glass-card p-6 rounded-2xl border border-dark-border relative flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold">
                      <Icon className="w-5 h-5 text-primary-light" />
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-dark-muted border border-dark-border">
                      {step.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-1">{step.title}</h3>
                  <div className="text-xs font-medium text-primary-light mb-3">{step.subtitle}</div>
                  <p className="text-xs text-dark-muted leading-relaxed mb-4">{step.description}</p>
                </div>

                <div className="pt-3 border-t border-dark-border/40 flex items-center justify-between text-[11px] text-emerald-400 font-mono">
                  <span className="flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Isolated Step</span>
                  </span>
                  {idx < steps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-dark-muted hidden lg:block" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
