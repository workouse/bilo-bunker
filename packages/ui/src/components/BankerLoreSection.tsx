import React from 'react';
import { Film, ShieldAlert, KeyRound, Award, Sparkles } from 'lucide-react';

export const BankerLoreSection: React.FC = () => {
  return (
    <section className="py-16 bg-slate-900/40 border-y border-dark-border/50 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3 mb-4 justify-center md:justify-start">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Film className="w-5 h-5" />
          </div>
          <span className="text-sm font-semibold tracking-wider text-amber-400 uppercase">
            The Banker Bilo Ethos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7 space-y-4">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Don&apos;t Let Custodial &quot;Mahos&quot; Trick You Into Key Exposure
            </h2>
            <p className="text-dark-muted leading-relaxed">
              In the legendary 1980 Turkish cinema classic <em>Banker Bilo</em>, Maho promises villagers a safe trip to Germany, only to abandon them in Istanbul and pocket their money. In the world of Nostr, centralized key services make similar promises—offering convenience while holding your private keys captive.
            </p>
            <p className="text-dark-muted leading-relaxed">
              Bilo learned the hard way, took control of his own fate, and became the ultimate self-sovereign <strong>Banker Bilo</strong>. With <strong>Bilo Bunker</strong>, you own your keys, run your own edge signing sandbox on Cloudflare, and never have to ask: <em>&quot;Yaptım ama bir sor niye yaptım?&quot;</em>
            </p>
          </div>

          <div className="md:col-span-5">
            <div className="glass-card p-6 rounded-2xl border border-dark-border relative space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-dark-border/60">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Custodial vs. Banker Bilo</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                  NIP-46
                </span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start space-x-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-rose-300">The &quot;Maho&quot; Custodial Risk</div>
                    <div className="text-xs text-rose-200/70">
                      Centralized servers hold raw `nsec` keys in shared databases, vulnerable to breaches or rogue admins.
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start space-x-3">
                  <KeyRound className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-emerald-300">The Banker Bilo Way</div>
                    <div className="text-xs text-emerald-200/70">
                      Isolated Cloudflare Durable Object per user with hardware-like SQLite isolation & NIP-44 v2 encryption.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-dark-muted font-mono">
                <span className="flex items-center space-x-1 text-amber-300">
                  <Award className="w-3.5 h-3.5" />
                  <span>100% Self-Sovereign</span>
                </span>
                <span>bunker-bilo.workouse.com</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
