"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Shield, DollarSign, Key, Fingerprint, FileText,
  CheckCircle, XCircle, Clock, SkipForward,
  Search, RefreshCw, Terminal, ChevronDown, ChevronUp,
  ScrollText, Eye,
} from "lucide-react";
import DashboardNav from "@/components/DashboardNav";
import { getAllAuditLogs } from "@/lib/api";

const AGENT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  compliance:   { label: "Compliance",   icon: <Shield className="h-4 w-4" />,      color: "bg-blue-500/10 text-blue-700" },
  negotiator:   { label: "Negotiator",   icon: <DollarSign className="h-4 w-4" />,  color: "bg-emerald-500/10 text-emerald-700" },
  contract:     { label: "Contract",     icon: <Key className="h-4 w-4" />,         color: "bg-amber-500/10 text-amber-700" },
  search:       { label: "Search",       icon: <Eye className="h-4 w-4" />,         color: "bg-purple-500/10 text-purple-700" },
  orchestrator: { label: "Orchestrator", icon: <ScrollText className="h-4 w-4" />,  color: "bg-cyan-500/10 text-cyan-700" },
  audit:        { label: "Audit",        icon: <FileText className="h-4 w-4" />,    color: "bg-gray-500/10 text-gray-700" },
  talent:       { label: "Talent",       icon: <Fingerprint className="h-4 w-4" />, color: "bg-rose-500/10 text-rose-700" },
};

interface LicenseContext {
  talent_name: string;
  brand_name: string;
  use_case: string;
  status: string;
}

interface AuditLogEntry {
  id: number;
  license_id: number | null;
  agent_name: string;
  action: string;
  details: string | null;
  model_used: string | null;
  tokens_used: number | null;
  license_context: LicenseContext | null;
  created_at: string;
}

const ALL_AGENTS = ["all", "compliance", "negotiator", "contract", "search", "orchestrator", "audit", "talent"];

export default function ClawConsolePage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getAllAuditLogs();
      setLogs(data);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (agentFilter !== "all" && log.agent_name !== agentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !log.agent_name.toLowerCase().includes(q) &&
          !log.action.toLowerCase().includes(q) &&
          !(log.details || "").toLowerCase().includes(q) &&
          !(log.license_context?.talent_name || "").toLowerCase().includes(q) &&
          !(log.license_context?.brand_name || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [logs, agentFilter, search]);

  const stats = useMemo(() => {
    const total = logs.length;
    const agents = new Set(logs.map((l) => l.agent_name));
    const withModel = logs.filter((l) => l.model_used).length;
    const totalTokens = logs.reduce((sum, l) => sum + (l.tokens_used || 0), 0);
    return { total, agents: agents.size, withModel, totalTokens };
  }, [logs]);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <DashboardNav />

      <div className="max-w-6xl mx-auto px-8 lg:px-16 py-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B0B0F] text-[#FAFAF8]">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B0B0F]">Claw Console</h1>
            <p className="font-body text-sm text-[#6B6B73]">All agent activity across every request</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Steps", value: stats.total, icon: <FileText className="h-4 w-4 text-[#6B6B73]" />, bg: "bg-[#F5F5F0]" },
            { label: "Active Agents", value: stats.agents, icon: <CheckCircle className="h-4 w-4 text-emerald-600" />, bg: "bg-emerald-500/10" },
            { label: "LLM Calls", value: stats.withModel, icon: <Terminal className="h-4 w-4 text-blue-600" />, bg: "bg-blue-500/10" },
            { label: "Total Tokens", value: stats.totalTokens.toLocaleString(), icon: <DollarSign className="h-4 w-4 text-amber-600" />, bg: "bg-amber-500/10" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-[#E0E0DA] rounded-lg p-4 flex items-center gap-3">
              <div className={`rounded-md p-2 ${s.bg}`}>{s.icon}</div>
              <div>
                <p className="font-body text-2xl font-bold text-[#0B0B0F]">{s.value}</p>
                <p className="font-body text-xs text-[#6B6B73]">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-[#E0E0DA] rounded-lg p-4 mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6B73]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents, talents, actions..."
              className="w-full pl-9 pr-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white focus:outline-none focus:border-[#1E3A5F]"
            />
          </div>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="px-3 py-2 border border-[#E0E0DA] rounded-md font-body text-sm bg-white min-w-[160px]"
          >
            {ALL_AGENTS.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "All Agents" : AGENT_META[a]?.label ?? a}
              </option>
            ))}
          </select>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 border border-[#E0E0DA] rounded-md hover:bg-[#F5F5F0] transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Log list */}
        <div className="bg-white border border-[#E0E0DA] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E0E0DA]">
            <span className="font-body text-sm text-[#6B6B73]">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {loading ? (
            <p className="p-6 text-center font-body text-sm text-[#6B6B73]">Loading agent logs...</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center font-body text-sm text-[#6B6B73]">No logs match your filters.</p>
          ) : (
            <div className="divide-y divide-[#E0E0DA]">
              {filtered.map((log) => {
                const agentName = log.agent_name as string;
                const meta = AGENT_META[agentName] ?? { label: agentName, icon: <FileText className="h-4 w-4" />, color: "bg-gray-500/10 text-gray-700" };
                const ctx = log.license_context;
                const isExpanded = expandedLog === (log.id as number);

                return (
                  <div
                    key={log.id}
                    className="px-4 py-3 hover:bg-[#F5F5F0]/50 cursor-pointer transition-colors"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Agent badge */}
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium font-body ${meta.color}`}>
                        {meta.icon}
                        {meta.label}
                      </span>

                      {/* Action */}
                      <span className="font-body text-sm text-[#0B0B0F]">{log.action}</span>

                      {/* Context */}
                      {ctx && (
                        <span className="font-body text-xs text-[#6B6B73] truncate hidden sm:inline">
                          {ctx.talent_name} / {ctx.brand_name}
                        </span>
                      )}

                      {/* Model used */}
                      {log.model_used && (
                        <span className="font-body text-[10px] px-2 py-0.5 rounded bg-[#F5F5F0] text-[#6B6B73] hidden md:inline">
                          {log.model_used}
                        </span>
                      )}

                      {/* Timestamp */}
                      <span className="font-body text-xs text-[#6B6B73] ml-auto hidden sm:inline">
                        {new Date(log.created_at).toLocaleString()}
                      </span>

                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-[#6B6B73]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#6B6B73]" />}
                    </div>

                    {isExpanded && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="font-body text-[11px] font-medium uppercase tracking-wider text-[#6B6B73] mb-1">Details</p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[#F5F5F0] p-3 font-body text-[11px]">
                            {log.details || "No details"}
                          </pre>
                        </div>
                        {ctx && (
                          <div>
                            <p className="font-body text-[11px] font-medium uppercase tracking-wider text-[#6B6B73] mb-1">License Context</p>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[#F5F5F0] p-3 font-body text-[11px]">
                              {JSON.stringify(ctx, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
