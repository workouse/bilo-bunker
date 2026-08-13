import React from 'react';
import { Globe, ExternalLink, ShieldCheck, Code, Server, Zap, Github, Twitter } from 'lucide-react';

export const WhoWeAreSection: React.FC = () => {
  return (
    <section id="who-we-are" className="py-20 bg-dark-bg/60 border-t border-dark-border/50 relative overflow-hidden font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>The Solo Edge &bull; Workouse.com</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Engineered by <span className="text-gradient">Workouse</span>
          </h2>
          <p className="text-dark-muted text-base sm:text-lg leading-relaxed">
            Workouse is a boutique, solo software development house building resilient, high-scale web applications for forward-thinking companies in Europe and the US.
          </p>
        </div>

        {/* Solo Architect Profile Card */}
        <div className="glass-card p-8 rounded-3xl border border-dark-border grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-2xl">
          <div className="lg:col-span-4 flex flex-col items-center text-center space-y-4 border-b lg:border-b-0 lg:border-r border-dark-border/60 pb-6 lg:pb-0 lg:pr-8">
            <div className="relative w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary/40 shadow-xl bg-dark-card">
              <img
                src="https://avatars.githubusercontent.com/u/55496985?s=400&v=4"
                alt="Emre Yılmaz"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Emre Yılmaz</h3>
              <p className="text-xs text-primary font-mono font-semibold">Senior Software Architect &amp; Founder</p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <a
                href="https://github.com/workouse"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-dark-bg hover:bg-slate-800 border border-dark-border text-dark-muted hover:text-white transition-colors"
                title="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href="https://x.com/workousecom"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-dark-bg hover:bg-slate-800 border border-dark-border text-dark-muted hover:text-white transition-colors"
                title="Twitter / X"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://workouse.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary transition-colors"
                title="workouse.com"
              >
                <Globe className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-5">
            <div className="space-y-2">
              <span className="text-xs font-mono text-amber-400 font-semibold uppercase tracking-wider">
                Direct Access to a Senior Architect
              </span>
              <h3 className="text-2xl font-bold text-white">
                Skip the Agency Overhead.
              </h3>
            </div>
            <p className="text-sm text-dark-muted leading-relaxed">
              When you hire an agency, you pay for sales cycles, account managers, and junior developers learning on your dime. At Workouse, you get direct access to a senior software architect with over <strong className="text-white">15+ years of industry experience</strong> bridging the gap between robust backend systems and modern frontend details.
            </p>

            {/* Core Competencies badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-dark-bg/80 p-3.5 rounded-xl border border-dark-border space-y-1">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                  <Code className="w-4 h-4 text-accent-purple" />
                  <span>Fullstack Architecture</span>
                </div>
                <p className="text-[11px] text-dark-muted">PHP, Symfony, TypeScript, Astro.js, Haskell</p>
              </div>

              <div className="bg-dark-bg/80 p-3.5 rounded-xl border border-dark-border space-y-1">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                  <Server className="w-4 h-4 text-accent-emerald" />
                  <span>DevOps &amp; Automation</span>
                </div>
                <p className="text-[11px] text-dark-muted">Nix flakes, Docker, IaC, AWS &amp; Cloud Infrastructure</p>
              </div>

              <div className="bg-dark-bg/80 p-3.5 rounded-xl border border-dark-border space-y-1">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                  <Zap className="w-4 h-4 text-accent-amber" />
                  <span>Performance</span>
                </div>
                <p className="text-[11px] text-dark-muted">Sub-millisecond latency &amp; algorithm optimization</p>
              </div>
            </div>
          </div>
        </div>

        {/* Callout Footer Banner */}
        <div className="glass-card p-6 rounded-2xl border border-dark-border flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl bg-gradient-to-r from-slate-900 via-dark-card to-slate-900">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-base font-bold text-white">Need Elite Software Engineering for Scale?</h4>
            <p className="text-xs text-dark-muted">Visit workouse.com to discuss custom architecture, edge deployments, or security audits.</p>
          </div>
          <a
            href="https://workouse.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-hover px-5 py-2.5 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-primary/20 shrink-0"
          >
            <Globe className="w-4 h-4" />
            <span>workouse.com</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
};
