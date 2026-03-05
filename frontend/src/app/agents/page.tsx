"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Handshake,
  AlertTriangle,
  ScrollText,
  ClipboardCheck,
  Search,
  Workflow,
  Activity,
  Zap,
  Hash,
} from "lucide-react";
import { getAgentsStatus } from "@/lib/api";

interface AgentInfo {
  name: string;
  role: string;
  provider: string;
}

interface AgentStats {
  total_actions: number;
  total_tokens_used: number;
  unique_agents_active: number;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  "Negotiator Agent": Handshake,
  "Compliance Agent": AlertTriangle,
  "Contract Agent": ScrollText,
  "Audit Agent": ClipboardCheck,
  "Search Agent": Search,
  "Orchestrator": Workflow,
};

const AGENT_COLORS: Record<string, string> = {
  "Negotiator Agent": "#1E3A5F",
  "Compliance Agent": "#B45309",
  "Contract Agent": "#0F766E",
  "Audit Agent": "#6B21A8",
  "Search Agent": "#0369A1",
  "Orchestrator": "#0B0B0F",
};

export default function AgentDashboardPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgentsStatus()
      .then((data) => {
        setAgents(data.agents || []);
        setStats(data.stats || null);
      })
      .catch(() => {
        // Fallback data for demo
        setAgents([
          { name: "Negotiator Agent", role: "Dynamic pricing & licensing terms", provider: "FLock (Qwen3)" },
          { name: "Compliance Agent", role: "Risk assessment & policy enforcement", provider: "FLock (DeepSeek)" },
          { name: "Contract Agent", role: "UK-law-compliant IP contract generation", provider: "Z.AI (GLM)" },
          { name: "Audit Agent", role: "Transaction logging & usage monitoring", provider: "Local" },
          { name: "Search Agent", role: "AI-driven talent discovery", provider: "FLock (DeepSeek)" },
          { name: "Orchestrator", role: "Multi-agent pipeline coordination", provider: "Local" },
        ]);
        setStats({ total_actions: 0, total_tokens_used: 0, unique_agents_active: 6 });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <nav className="flex items-center justify-between px-8 lg:px-16 h-16 border-b border-[#E0E0DA] bg-white">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#0B0B0F]">
            <span className="font-display text-sm font-bold italic text-[#0B0B0F]">FL</span>
          </div>
          <div className="flex flex-col">
            <span className="font-body text-sm font-bold tracking-[0.2em] text-[#0B0B0F]">FACE LIBRARY</span>
            <span className="font-body text-[7px] font-light tracking-[0.25em] text-[#6B6B73]">LIKENESS INFRASTRUCTURE</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 lg:px-16 py-16">
        <div className="mb-12">
          <p className="font-body text-xs tracking-[0.25em] uppercase text-[#1E3A5F] mb-3">
            System Overview
          </p>
          <h1 className="font-display text-4xl lg:text-5xl font-light text-[#0B0B0F] leading-tight">
            Agent <span className="italic">Orchestration</span>
          </h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-12">
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <Activity className="w-4 h-4 text-[#1E3A5F]" />
              <span className="font-body text-xs tracking-[0.15em] uppercase text-[#6B6B73]">Total Actions</span>
            </div>
            <p className="font-display text-3xl text-[#0B0B0F]">
              {loading ? "—" : stats?.total_actions ?? 0}
            </p>
          </div>
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <Hash className="w-4 h-4 text-[#1E3A5F]" />
              <span className="font-body text-xs tracking-[0.15em] uppercase text-[#6B6B73]">Tokens Used</span>
            </div>
            <p className="font-display text-3xl text-[#0B0B0F]">
              {loading ? "—" : (stats?.total_tokens_used ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <Zap className="w-4 h-4 text-[#1E3A5F]" />
              <span className="font-body text-xs tracking-[0.15em] uppercase text-[#6B6B73]">Active Agents</span>
            </div>
            <p className="font-display text-3xl text-[#0B0B0F]">
              {loading ? "—" : stats?.unique_agents_active ?? 6}
            </p>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent) => {
            const Icon = AGENT_ICONS[agent.name] || Workflow;
            const color = AGENT_COLORS[agent.name] || "#0B0B0F";
            return (
              <div
                key={agent.name}
                className="bg-white border border-[#E0E0DA] rounded-lg p-6 card-lift hover:border-[#1E3A5F]/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center agent-pulse"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="w-4 h-4 text-white" strokeWidth={1.5} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-body text-[10px] text-emerald-600 uppercase tracking-wider">Online</span>
                  </div>
                </div>
                <h3 className="font-display text-xl text-[#0B0B0F] mb-1">{agent.name}</h3>
                <p className="font-body text-xs text-[#6B6B73] mb-4 leading-relaxed">{agent.role}</p>
                <div className="pt-3 border-t border-[#E0E0DA]">
                  <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[#1E3A5F]">
                    {agent.provider}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Architecture Diagram */}
        <div className="mt-16 bg-[#0B0B0F] rounded-lg p-8 lg:p-12 text-[#FAFAF8]">
          <p className="font-body text-xs tracking-[0.25em] uppercase text-[#FAFAF8]/40 mb-4">
            Pipeline Architecture
          </p>
          <pre className="font-mono text-xs leading-relaxed text-[#FAFAF8]/70 overflow-x-auto">
{`  ┌─────────────────────────────────────────────────────────────┐
  │                    OPENCLAW ORCHESTRATOR                    │
  │                                                             │
  │   Request ──▶ Compliance ──▶ Negotiator ──▶ Contract        │
  │      │          Agent         Agent         Agent           │
  │      │            │             │             │             │
  │      │            ▼             ▼             ▼             │
  │      │       Risk Score    Pricing &     UK-Law IP          │
  │      │       GDPR Check   Terms         Contract            │
  │      │                                                      │
  │      └──────── Audit Agent (logging all transactions) ──────│
  │                                                             │
  │   Providers: FLock (Qwen3, DeepSeek) · Z.AI (GLM-4 Plus)  │
  │   Tracing:   Anyway SDK (OpenTelemetry)                     │
  └─────────────────────────────────────────────────────────────┘`}
          </pre>
        </div>
      </div>
    </div>
  );
}
