import React, { useState } from 'react';
import { Trash2, Key, Sliders, Zap } from 'lucide-react';
import { GranularRulesModal, GranularRule } from './GranularRulesModal';

export interface ClientRecord {
  client_pubkey: string;
  permissions: string;
  created_at: number;
  updated_at: number;
}

interface PermissionsPageProps {
  clients: ClientRecord[];
  clientRulesMap: Record<string, GranularRule[]>;
  onRevoke: (clientPubkey: string) => void;
  onSaveRules: (clientPubkey: string, rules: GranularRule[]) => Promise<void>;
  onResetRules: (clientPubkey: string) => Promise<void>;
}

export const PermissionsPage: React.FC<PermissionsPageProps> = ({
  clients,
  clientRulesMap,
  onRevoke,
  onSaveRules,
  onResetRules,
}) => {
  const [selectedClientForRules, setSelectedClientForRules] = useState<string | null>(null);

  const getClientRules = (clientPubkey: string): GranularRule[] => {
    return clientRulesMap[clientPubkey] || [];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Authorized Client Applications</h2>
          <p className="text-sm text-dark-muted">
            Configure fine-grained signing permissions and allow/block rules per client
          </p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden border border-dark-border">
        {clients.length === 0 ? (
          <div className="p-8 text-center text-dark-muted">
            <Key className="w-8 h-8 mx-auto mb-2 text-dark-muted/50" />
            <p className="text-sm">No authorized client applications found.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-dark-border bg-dark-bg/50 text-xs font-semibold text-dark-muted uppercase tracking-wider">
                <th className="px-6 py-4">Client Public Key</th>
                <th className="px-6 py-4">Active Policy & Rules</th>
                <th className="px-6 py-4">Last Active</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border text-sm">
              {clients.map((client) => {
                const rules = getClientRules(client.client_pubkey);
                const hasCustomRules = rules.length > 0;

                return (
                  <tr
                    key={client.client_pubkey}
                    className="hover:bg-dark-card/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono text-xs text-white">
                      <div className="font-semibold">
                        {client.client_pubkey.slice(0, 12)}...{client.client_pubkey.slice(-8)}
                      </div>
                      <div className="text-[10px] text-dark-muted mt-0.5">
                        Connected: {new Date(client.created_at * 1000).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {hasCustomRules ? (
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {rules.slice(0, 5).map((rule, idx) => (
                            <span
                              key={idx}
                              className={`text-[10px] px-2 py-0.5 rounded border inline-flex items-center space-x-1 ${
                                rule.policy === 'allow'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              <span>
                                {rule.policy === 'allow' ? '✓' : '✕'}{' '}
                                {rule.label || rule.method}
                              </span>
                            </span>
                          ))}
                          {rules.length > 5 && (
                            <span className="text-[10px] bg-dark-bg text-dark-muted border border-dark-border px-1.5 py-0.5 rounded">
                              +{rules.length - 5} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] bg-primary/10 text-primary-light border border-primary/20 px-2 py-0.5 rounded inline-flex items-center space-x-1">
                            <Zap className="w-3 h-3" />
                            <span>Full Access (Default)</span>
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-xs text-dark-muted">
                      {new Date(client.updated_at * 1000).toLocaleString()}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setSelectedClientForRules(client.client_pubkey)}
                          className="inline-flex items-center space-x-1 text-xs bg-primary/10 text-primary-light hover:bg-primary/20 border border-primary/20 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Configure Rules</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onRevoke(client.client_pubkey)}
                          className="inline-flex items-center space-x-1 text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedClientForRules && (
        <GranularRulesModal
          isOpen={!!selectedClientForRules}
          clientPubkey={selectedClientForRules}
          initialRules={getClientRules(selectedClientForRules)}
          onClose={() => setSelectedClientForRules(null)}
          onSave={onSaveRules}
          onReset={onResetRules}
        />
      )}
    </div>
  );
};
