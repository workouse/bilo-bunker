import React from 'react';
import { Trash2, Key } from 'lucide-react';

export interface ClientRecord {
  client_pubkey: string;
  permissions: string;
  created_at: number;
  updated_at: number;
}

interface PermissionsPageProps {
  clients: ClientRecord[];
  onRevoke: (clientPubkey: string) => void;
}

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ clients, onRevoke }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Authorized Client Applications</h2>
        <p className="text-sm text-dark-muted">Manage active client access permissions granted to your Bunker</p>
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
                <th className="px-6 py-4">Granted Permissions</th>
                <th className="px-6 py-4">Last Active</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border text-sm">
              {clients.map((client) => (
                <tr key={client.client_pubkey} className="hover:bg-dark-card/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-white">
                    {client.client_pubkey.slice(0, 12)}...{client.client_pubkey.slice(-8)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {client.permissions.split(',').map((perm) => (
                        <span
                          key={perm}
                          className="text-[10px] bg-primary/10 text-primary-light border border-primary/20 px-2 py-0.5 rounded"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-dark-muted">
                    {new Date(client.updated_at * 1000).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onRevoke(client.client_pubkey)}
                      className="inline-flex items-center space-x-1 text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revoke</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
