import React from 'react';
import { ShieldCheck, Github, ExternalLink, Heart } from 'lucide-react';

export const LandingFooter: React.FC = () => {
  return (
    <footer className="bg-slate-950 border-t border-dark-border py-12 text-sm text-dark-muted">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-dark-border/60">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold text-white tracking-wide">Bilo Bunker</span>
            </div>
            <p className="text-xs text-dark-muted max-w-sm leading-relaxed">
              Multi-Tenant Nostr Remote Signer (NIP-46) &amp; TailAdmin Management Engine built for Docker, Docker Compose, Caddy &amp; Node.js. Hosted on <span className="text-white font-mono">app.bunker-bilo.workouse.com</span> and <span className="text-emerald-400 font-mono">api.bunker-bilo.workouse.com</span>.
            </p>
            <div className="text-xs font-mono text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg inline-block">
              &quot;Be the Banker of your own Nostr Keys.&quot;
            </div>
          </div>

          {/* Protocol Links */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white">Nostr Protocols</div>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://github.com/nostr-protocol/nips/blob/master/46.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center space-x-1"
                >
                  <span>NIP-46 Remote Signer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/nostr-protocol/nips/blob/master/44.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center space-x-1"
                >
                  <span>NIP-44 v2 Encryption</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/nostr-protocol/nips/blob/master/07.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center space-x-1"
                >
                  <span>NIP-07 Browser Extension</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/nostr-protocol/nips/blob/master/98.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center space-x-1"
                >
                  <span>NIP-98 HTTP Auth</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Open Source */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-white">Open Source</div>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://github.com/workouse/bilo-bunker"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center space-x-1 font-medium text-white"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span>github.com/workouse/bilo-bunker</span>
                </a>
              </li>
              <li>
                <span className="text-dark-muted">License: MIT License</span>
              </li>
              <li>
                <span className="text-dark-muted">Runtime: Docker / Node.js 22 + Caddy Auto-SSL</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-dark-muted gap-4">
          <div>
            &copy; {new Date().getFullYear()} Bilo Bunker Project. Released under MIT License.
          </div>
          <div className="flex items-center space-x-1">
            <span>Crafted with</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 inline" />
            <span>for the decentralized Nostr ecosystem.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
