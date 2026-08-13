import React from 'react';
import { LayoutDashboard, Link2, Shield, ScrollText, User } from 'lucide-react';

export type TabType = 'overview' | 'bunker_uri' | 'permissions' | 'audit_logs' | 'user_profile';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'bunker_uri', label: 'Bunker URIs', icon: <Link2 className="w-4 h-4" /> },
    { id: 'permissions', label: 'App Permissions', icon: <Shield className="w-4 h-4" /> },
    { id: 'audit_logs', label: 'Audit Logs', icon: <ScrollText className="w-4 h-4" /> },
    { id: 'user_profile', label: 'User Profile', icon: <User className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 border-r border-dark-border p-4 min-h-[calc(100vh-73px)]">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-dark-muted hover:text-white hover:bg-dark-card'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
