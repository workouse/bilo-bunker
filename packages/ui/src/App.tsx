import { useState, useEffect, useCallback } from 'react';
import { useNostrAuth } from './hooks/useNostrAuth';
import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { OverviewPage } from './components/OverviewPage';
import { BunkerUriPage, BunkerConnection } from './components/BunkerUriPage';
import { PermissionsPage, ClientRecord } from './components/PermissionsPage';
import { GranularRule } from './components/GranularRulesModal';
import { AuditLogsPage, AuditLogRecord } from './components/AuditLogsPage';
import { UserProfilePage } from './components/UserProfilePage';
import { LandingPage } from './components/LandingPage';
import { ShieldCheck, Key, AlertCircle, ArrowLeft } from 'lucide-react';

export function App() {
  const { npub, pubkey, profile, isLoading, error, loginWithNip07, logout, fetchWithNip98, hasExtension } = useNostrAuth();
  
  const getRouteFromHash = useCallback((): { view: 'landing' | 'dashboard'; tab: TabType } => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'landing' || (!hash && !localStorage.getItem('bunker_user_pubkey'))) {
      return { view: 'landing', tab: 'overview' };
    }
    const validTabs: TabType[] = ['overview', 'bunker_uri', 'permissions', 'audit_logs', 'user_profile'];
    if (validTabs.includes(hash as TabType)) {
      return { view: 'dashboard', tab: hash as TabType };
    }
    return { view: 'dashboard', tab: 'overview' };
  }, []);

  const initialRoute = getRouteFromHash();
  const [viewMode, setViewMode] = useState<'landing' | 'dashboard'>(initialRoute.view);
  const [activeTab, setActiveTab] = useState<TabType>(initialRoute.tab);

  useEffect(() => {
    const handleHashChange = () => {
      const { view, tab } = getRouteFromHash();
      setViewMode(view);
      setActiveTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [getRouteFromHash]);

  const navigateToTab = (tab: TabType) => {
    setActiveTab(tab);
    setViewMode('dashboard');
    window.location.hash = `#${tab}`;
  };

  const navigateToLanding = () => {
    setViewMode('landing');
    window.location.hash = '#landing';
  };

  const [bunkerPubkey, setBunkerPubkey] = useState<string>('');
  const [bunkerUri, setBunkerUri] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientRulesMap, setClientRulesMap] = useState<Record<string, GranularRule[]>>({});
  const [connections, setConnections] = useState<BunkerConnection[]>([]);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);

  const loadDashboardData = useCallback(async () => {
    if (!pubkey) return;
    try {
      // Fetch profile & bunker info
      const profileRes = await fetchWithNip98('/api/v1/user/profile');
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setBunkerPubkey(profileData.bunkerPubkey || '');
      }

      // Fetch Bunker connection URI
      const uriRes = await fetchWithNip98('/api/v1/bunker/uri');
      if (uriRes.ok) {
        const uriData = await uriRes.json();
        setBunkerUri(uriData.uri || null);
      }

      // Fetch connections list
      const connectionsRes = await fetchWithNip98('/api/v1/bunker/connections');
      if (connectionsRes.ok) {
        const connData = await connectionsRes.json();
        setConnections(connData.connections || []);
      }

      // Fetch clients
      const clientsRes = await fetchWithNip98('/api/v1/bunker/clients');
      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        const loadedClients: ClientRecord[] = clientsData.clients || [];
        setClients(loadedClients);

        // Fetch granular rules for each client
        const rulesMap: Record<string, GranularRule[]> = {};
        await Promise.all(
          loadedClients.map(async (client) => {
            try {
              const ruleRes = await fetchWithNip98(
                `/api/v1/bunker/clients/${client.client_pubkey}/rules`
              );
              if (ruleRes.ok) {
                const ruleData = await ruleRes.json();
                if (ruleData.rules && Array.isArray(ruleData.rules)) {
                  rulesMap[client.client_pubkey] = ruleData.rules;
                }
              }
            } catch {
              // ignore
            }
          })
        );
        setClientRulesMap(rulesMap);
      }

      // Fetch audit logs
      const logsRes = await fetchWithNip98('/api/v1/bunker/logs');
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard data from backend:', err);
      setConnections([]);
      setClients([]);
      setLogs([]);
    }
  }, [pubkey, fetchWithNip98]);

  useEffect(() => {
    if (pubkey) {
      loadDashboardData();
    }
  }, [pubkey, loadDashboardData]);

  const handleCreateConnection = async (data: {
    name: string;
    nsec: string;
    expiration: number;
    whitelistedNpub: string;
    relays: string[];
    rules?: GranularRule[];
  }) => {
    try {
      const res = await fetchWithNip98('/api/v1/bunker/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.connection) {
          setConnections((prev) => [json.connection, ...prev]);
        }
      }
    } catch {
      // Local optimistic fallback
      const newConn: BunkerConnection = {
        id: 'conn_' + Math.random().toString(36).substring(2, 10),
        name: data.name,
        nsec: data.nsec,
        expiration: data.expiration,
        whitelisted_npub: data.whitelistedNpub,
        relays: data.relays.join(', '),
        rules: data.rules,
        permissions: data.rules ? JSON.stringify(data.rules) : '*',
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      };
      setConnections((prev) => [newConn, ...prev]);
      setLogs((prev) => [
        {
          id: Date.now(),
          client_pubkey: data.whitelistedNpub || 'system',
          method: 'create_connection',
          params: JSON.stringify({ name: data.name, whitelistedNpub: data.whitelistedNpub }),
          status: 'CREATED',
          created_at: Math.floor(Date.now() / 1000),
        },
        ...prev,
      ]);
    }
  };

  const handleEditConnection = async (
    id: string,
    data: {
      name: string;
      nsec: string;
      expiration: number;
      whitelistedNpub: string;
      relays: string[];
      rules?: GranularRule[];
    }
  ) => {
    try {
      const res = await fetchWithNip98(`/api/v1/bunker/connections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.connection) {
          setConnections((prev) => prev.map((c) => (c.id === id ? json.connection : c)));
        }
      }
    } catch {
      // Local optimistic update
      setConnections((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                name: data.name,
                nsec: data.nsec,
                expiration: data.expiration,
                whitelisted_npub: data.whitelistedNpub,
                relays: data.relays.join(', '),
                rules: data.rules,
                permissions: data.rules ? JSON.stringify(data.rules) : c.permissions,
                updated_at: Math.floor(Date.now() / 1000),
              }
            : c
        )
      );
    }
  };

  const handleDeleteConnection = async (id: string) => {
    try {
      await fetchWithNip98(`/api/v1/bunker/connections/${id}`, { method: 'DELETE' });
    } catch {
      // Optimistic delete
    }
    setConnections((prev) => prev.filter((c) => c.id !== id));
  };

  const handleRevokeClient = async (clientPubkey: string) => {
    try {
      await fetchWithNip98(`/api/v1/bunker/clients/${clientPubkey}`, { method: 'DELETE' });
    } catch {
      // Local optimistic update fallback
    }
    setClients((prev) => prev.filter((c) => c.client_pubkey !== clientPubkey));
    setClientRulesMap((prev) => {
      const updated = { ...prev };
      delete updated[clientPubkey];
      return updated;
    });
  };

  const handleSaveRules = async (clientPubkey: string, rules: GranularRule[]) => {
    try {
      const res = await fetchWithNip98(`/api/v1/bunker/clients/${clientPubkey}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      if (res.ok) {
        const data = await res.json();
        setClientRulesMap((prev) => ({
          ...prev,
          [clientPubkey]: data.rules || rules,
        }));
      }
    } catch {
      // Local optimistic update fallback
      setClientRulesMap((prev) => ({
        ...prev,
        [clientPubkey]: rules,
      }));
    }
  };

  const handleResetRules = async (clientPubkey: string) => {
    try {
      await fetchWithNip98(`/api/v1/bunker/clients/${clientPubkey}/rules`, {
        method: 'DELETE',
      });
      setClientRulesMap((prev) => {
        const updated = { ...prev };
        delete updated[clientPubkey];
        return updated;
      });
    } catch {
      // Local optimistic update fallback
      setClientRulesMap((prev) => {
        const updated = { ...prev };
        delete updated[clientPubkey];
        return updated;
      });
    }
  };

  const handleFetchRelays = async (target: { nsec?: string; pubkey?: string }): Promise<string[]> => {
    try {
      const res = await fetchWithNip98('/api/v1/bunker/relays/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.relays && Array.isArray(json.relays)) {
          return json.relays;
        }
      }
    } catch {
      // ignore
    }
    return ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://relay.primal.net'];
  };

  if (viewMode === 'landing') {
    return <LandingPage onLaunchDashboard={() => navigateToTab('overview')} />;
  }

  if (!pubkey) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-dark-bg relative">
        <button
          onClick={navigateToLanding}
          className="absolute top-6 left-6 inline-flex items-center space-x-2 text-xs font-semibold text-dark-muted hover:text-white bg-slate-800/80 border border-dark-border px-3.5 py-2 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Landing Page</span>
        </button>

        <div className="glass-card max-w-md w-full p-8 rounded-2xl space-y-6 text-center border border-dark-border shadow-2xl">
          <div className="w-16 h-16 bg-primary/20 text-primary rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Bilo Bunker Login</h2>
            <p className="text-sm text-dark-muted">
              Authenticate via NIP-07 extension to manage your remote signer and active client permissions.
            </p>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-xs flex items-center space-x-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={loginWithNip07}
            disabled={isLoading || !hasExtension}
            className="w-full flex items-center justify-center space-x-2 bg-primary hover:bg-primary-hover px-6 py-3.5 rounded-xl font-semibold text-white transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
          >
            <Key className="w-5 h-5" />
            <span>{isLoading ? 'Authenticating...' : 'Sign In with NIP-07 (window.nostr)'}</span>
          </button>

          {!hasExtension && (
            <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
              No Nostr extension detected. Please install Alby, nos2x, or a compatible NIP-07 browser extension.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col font-sans">
      <Header npub={npub} profile={profile} onLogout={logout} onGoToLanding={navigateToLanding} />
      <div className="flex-1 flex">
        <Sidebar activeTab={activeTab} onTabChange={navigateToTab} />
        <main className="flex-1 p-8">
          {activeTab === 'overview' && (
            <OverviewPage bunkerPubkey={bunkerPubkey} clientCount={clients.length} logCount={logs.length} />
          )}
          {activeTab === 'bunker_uri' && (
            <BunkerUriPage
              bunkerUri={bunkerUri}
              connections={connections}
              userNsec="nsec1_logged_in_user_key"
              onRefresh={loadDashboardData}
              onCreateConnection={handleCreateConnection}
              onEditConnection={handleEditConnection}
              onDeleteConnection={handleDeleteConnection}
              onFetchRelays={handleFetchRelays}
            />
          )}
          {activeTab === 'permissions' && (
            <PermissionsPage
              clients={clients}
              clientRulesMap={clientRulesMap}
              onRevoke={handleRevokeClient}
              onSaveRules={handleSaveRules}
              onResetRules={handleResetRules}
            />
          )}
          {activeTab === 'audit_logs' && <AuditLogsPage logs={logs} />}
          {activeTab === 'user_profile' && (
            <UserProfilePage pubkey={pubkey} npub={npub} profile={profile} bunkerPubkey={bunkerPubkey} />
          )}
        </main>
      </div>
    </div>
  );
}
