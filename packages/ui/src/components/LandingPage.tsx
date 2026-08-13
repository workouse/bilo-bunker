import React from 'react';
import { ShieldCheck, Github, LayoutDashboard, Globe } from 'lucide-react';
import { LandingHero } from './LandingHero';
import { DashboardPreviewSection } from './DashboardPreviewSection';
import { BankerLoreSection } from './BankerLoreSection';
import { PlatformFeatures } from './PlatformFeatures';
import { QuickstartSection } from './QuickstartSection';
import { ArchitectureSection } from './ArchitectureSection';
import { WhoWeAreSection } from './WhoWeAreSection';
import { LandingFooter } from './LandingFooter';

interface LandingPageProps {
  onLaunchDashboard: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunchDashboard }) => {
  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col font-sans selection:bg-primary/30 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-dark-bg/80 backdrop-blur-md border-b border-dark-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white tracking-tight text-lg">Bilo Bunker</span>
              <span className="hidden sm:inline-flex items-center space-x-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-dark-muted border border-dark-border">
                <Globe className="w-3 h-3 text-primary" />
                <span>bunker-bilo.workouse.com</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href="https://github.com/workouse/bilo-bunker"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-dark-muted hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
              title="GitHub Repository"
            >
              <Github className="w-5 h-5" />
            </a>

            <button
              onClick={onLaunchDashboard}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold text-xs text-white bg-primary hover:bg-primary-hover transition-all shadow-md shadow-primary/20"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Admin Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Sections */}
      <main className="flex-1">
        <LandingHero onLaunchDashboard={onLaunchDashboard} />
        <DashboardPreviewSection />
        <BankerLoreSection />
        <PlatformFeatures />
        <ArchitectureSection />
        <QuickstartSection />
        <WhoWeAreSection />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
};
