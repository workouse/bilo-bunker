import React, { useState } from 'react';
import { Search, ScrollText, ChevronRight, ChevronDown, Eye, Copy, Check, Filter } from 'lucide-react';

export interface AuditLogRecord {
  id: number;
  client_pubkey: string;
  method: string;
  params: string;
  status: string;
  created_at: number;
}

interface AuditLogsPageProps {
  logs: AuditLogRecord[];
}

export const AuditLogsPage: React.FC<AuditLogsPageProps> = ({ logs }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.client_pubkey.toLowerCase().includes(search.toLowerCase()) ||
      log.method.toLowerCase().includes(search.toLowerCase()) ||
      log.status.toLowerCase().includes(search.toLowerCase()) ||
      log.params.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || log.status.toUpperCase() === statusFilter.toUpperCase();

    return matchesSearch && matchesStatus;
  });

  const handleCopyParams = (params: string, id: number) => {
    navigator.clipboard.writeText(params);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'SUCCESS' || s === 'CREATED') {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    if (s === 'MODIFIED' || s === 'REVOKED') {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
    if (s === 'BLOCKED' || s === 'FORBIDDEN' || s === 'UNAUTHORIZED' || s === 'DELETED') {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  const formatParams = (paramsStr: string) => {
    try {
      const parsed = JSON.parse(paramsStr);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return paramsStr || '{}';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">RPC Execution &amp; Security Audit Stream</h2>
          <p className="text-sm text-dark-muted">Real-time cryptographic audit trail of NIP-46 operations executed on your edge Bunker</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Status Filter Dropdown */}
          <div className="relative flex items-center bg-dark-bg border border-dark-border rounded-xl px-3 py-1.5 text-xs text-dark-muted space-x-2">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-dark-card">All Statuses</option>
              <option value="SUCCESS" className="bg-dark-card">SUCCESS</option>
              <option value="CREATED" className="bg-dark-card">CREATED</option>
              <option value="MODIFIED" className="bg-dark-card">MODIFIED</option>
              <option value="REVOKED" className="bg-dark-card">REVOKED</option>
              <option value="FORBIDDEN" className="bg-dark-card">FORBIDDEN</option>
              <option value="UNAUTHORIZED" className="bg-dark-card">UNAUTHORIZED</option>
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-dark-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search method, pubkey, params..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-white focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-dark-border shadow-xl">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-dark-muted">
            <ScrollText className="w-10 h-10 mx-auto mb-3 text-dark-muted/40" />
            <h4 className="text-base font-bold text-white mb-1">No Audit Logs Found</h4>
            <p className="text-xs">No execution audit records match your search or filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-dark-border bg-dark-bg/60 text-[11px] font-semibold text-dark-muted uppercase tracking-wider">
                  <th className="w-10 px-4 py-3.5"></th>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Client / Target Pubkey</th>
                  <th className="px-4 py-3.5">Method</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border/60 text-xs">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const formattedJson = formatParams(log.params);

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className={`hover:bg-dark-card/60 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-dark-card/80' : ''
                        }`}
                      >
                        <td className="px-4 py-3.5 text-dark-muted text-center">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-dark-muted whitespace-nowrap">
                          {new Date(log.created_at * 1000).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-white font-medium">
                          {log.client_pubkey.length > 16
                            ? `${log.client_pubkey.slice(0, 10)}...${log.client_pubkey.slice(-6)}`
                            : log.client_pubkey}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-accent-purple">
                          {log.method}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${getStatusBadge(
                              log.status
                            )}`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button className="text-xs text-primary font-semibold hover:underline inline-flex items-center space-x-1">
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Parameters Drawer Row */}
                      {isExpanded && (
                        <tr className="bg-dark-bg/90 border-b border-dark-border">
                          <td colSpan={6} className="p-4">
                            <div className="bg-slate-950 p-4 rounded-xl border border-dark-border space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-mono text-dark-muted uppercase font-bold">
                                  Audit Record #{log.id} &bull; Execution Parameters Payload
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyParams(log.params, log.id);
                                  }}
                                  className="text-xs bg-dark-card hover:bg-slate-800 border border-dark-border px-3 py-1 rounded-lg text-white font-mono flex items-center space-x-1.5 transition-colors"
                                >
                                  {copiedId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  <span>{copiedId === log.id ? 'Copied' : 'Copy JSON'}</span>
                                </button>
                              </div>
                              <pre className="text-xs font-mono text-emerald-400 bg-slate-900 p-3 rounded-lg overflow-x-auto border border-slate-800 leading-relaxed">
                                {formattedJson}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
