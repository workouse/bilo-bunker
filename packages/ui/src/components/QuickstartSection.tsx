import React, { useState } from 'react';
import { Terminal, Copy, Check, Play, Code2, Server, Globe, Wrench } from 'lucide-react';

export const QuickstartSection: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const commands = [
    {
      label: 'Clone & Enter Repository',
      code: 'git clone https://github.com/workouse/bilo-bunker.git && cd bilo-bunker',
    },
    {
      label: 'Verify Node & Install Workspace Dependencies',
      code: 'make install',
    },
    {
      label: 'First-Time Interactive Cloudflare Setup',
      code: 'make blackstart',
    },
    {
      label: 'Deploy to Cloudflare Workers & Your Custom Domain',
      code: 'make deploy',
    },
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const fullSnippet = commands.map((c) => c.code).join('\n');

  return (
    <section className="py-20 bg-slate-900/30 border-t border-dark-border/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Play className="w-3.5 h-3.5" />
            <span>Easy Self-Hosting DX</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Up &amp; Running in 4 Simple Commands
          </h2>
          <p className="text-dark-muted text-sm sm:text-base">
            No complex database migrations, background redis instances, or docker monsters. Powered by Makefile DX automation.
          </p>
        </div>

        <div className="glass-card rounded-2xl border border-dark-border overflow-hidden shadow-2xl">
          {/* Terminal Top Bar */}
          <div className="bg-slate-900/90 px-4 py-3 border-b border-dark-border/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="text-xs font-mono text-dark-muted ml-2 flex items-center space-x-1">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                <span>bilo-bunker bash — make</span>
              </span>
            </div>

            <button
              onClick={() => handleCopy(fullSnippet, 99)}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-dark-text border border-dark-border transition-colors"
            >
              {copiedIndex === 99 ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">All Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Script</span>
                </>
              )}
            </button>
          </div>

          {/* Terminal Output */}
          <div className="p-6 font-mono text-sm space-y-6 bg-slate-950/80">
            {commands.map((cmd, idx) => (
              <div key={idx} className="group relative">
                <div className="text-xs text-dark-muted mb-1 flex items-center space-x-2">
                  <span className="text-primary font-semibold">Step {idx + 1}:</span>
                  <span>{cmd.label}</span>
                </div>
                <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 group-hover:border-slate-700 transition-colors">
                  <div className="flex items-center space-x-3 text-emerald-400 overflow-x-auto">
                    <span className="text-slate-500 select-none">$</span>
                    <span className="text-slate-100">{cmd.code}</span>
                  </div>

                  <button
                    onClick={() => handleCopy(cmd.code, idx)}
                    className="p-1.5 rounded text-dark-muted hover:text-white hover:bg-slate-800 transition-colors ml-2 shrink-0"
                    title="Copy command"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quickstart Footer */}
          <div className="bg-slate-900/60 p-4 border-t border-dark-border/60 flex flex-col sm:flex-row items-center justify-between text-xs text-dark-muted gap-2">
            <div className="flex items-center space-x-2">
              <Code2 className="w-4 h-4 text-primary" />
              <span>Requires Node.js ^20.0.0 &amp; pnpm</span>
            </div>
            <div className="flex items-center space-x-2 font-mono">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Deploy target: custom Cloudflare Worker domain</span>
            </div>
          </div>
        </div>

        {/* Self-Hosted Domain Flexibility Card */}
        <div className="glass-card p-6 rounded-2xl border border-dark-border space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-accent-purple/10 text-accent-purple border border-accent-purple/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Self-Hosted Domain Architecture</h3>
              <p className="text-xs text-dark-muted">
                Self-hosted deployments only require your Admin Dashboard and API endpoints. The marketing landing page is optional.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
              <div className="text-emerald-400 font-bold flex items-center space-x-1">
                <Wrench className="w-3.5 h-3.5" />
                <span>Admin Dashboard Domain</span>
              </div>
              <div className="text-slate-300">app.yourdomain.com</div>
              <div className="text-dark-muted text-[11px] font-sans">
                Serves the NIP-07 management interface for authorized users.
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1.5">
              <div className="text-primary-light font-bold flex items-center space-x-1">
                <Wrench className="w-3.5 h-3.5" />
                <span>Backend API &amp; NIP-46 Gateway</span>
              </div>
              <div className="text-slate-300">api.yourdomain.com</div>
              <div className="text-dark-muted text-[11px] font-sans">
                Handles NIP-98 authentication, WebSocket relay connections, and DO state dispatch.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
