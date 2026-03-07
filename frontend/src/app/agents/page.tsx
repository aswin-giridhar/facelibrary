/**
 * Agent Orchestration Dashboard — Shows all 9 AI agents and their status.
 *
 * Displays:
 * - System stats: Total Actions, Tokens Used, Active Agents, Licenses Processed
 * - Agent grid: 9 cards with name, role, SDG badges, models used, per-agent stats
 * - Model Registry: All configured LLM models with availability status
 * - Pipeline Architecture: ASCII diagram of the 7-step licensing pipeline
 *
 * Agents: Compliance, Negotiator, Contract, Gen Orchestrator, Fingerprint,
 *         Web3 Contract, Search, Audit, Orchestrator
 *
 * Accessible at: /agents (public)
 */
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
  Globe,
  Cpu,
} from "lucide-react";
import { getAgentsStatus } from "@/lib/api";

interface AgentInfo {
  name: string;
  id: string;
  role: string;
  provider: string;
  models: string[];
  sdg: string[];
}

interface AgentStats {
  total_actions: number;
  total_tokens_used: number;
  unique_agents_active: number;
  licenses_processed: number;
}

interface PerAgentStat {
  agent_name: string;
  total_actions: number;
  total_tokens: number;
}

interface ModelInfo {
  tier: string;
  model_id: string;
  provider: string;
  available: boolean;
}

// Icon mapping for each agent card on the orchestration dashboard
const AGENT_ICONS: Record<string, React.ElementType> = {
  "Compliance & Risk Agent": AlertTriangle,
  "Pricing Negotiator Agent": Handshake,
  "IP Contract Agent": ScrollText,
  "Avatar Generation Agent": Cpu,
  "Likeness Fingerprint Agent": ClipboardCheck,
  "Web3 Rights Agent": Globe,
  "Talent Discovery Agent": Search,
  "Audit & Logging Agent": ClipboardCheck,
  "Pipeline Orchestrator": Workflow,
};

// Color mapping for agent card icons
const AGENT_COLORS: Record<string, string> = {
  "Compliance & Risk Agent": "#B45309",
  "Pricing Negotiator Agent": "#1E3A5F",
  "IP Contract Agent": "#0F766E",
  "Avatar Generation Agent": "#7C3AED",
  "Likeness Fingerprint Agent": "#E11D48",
  "Web3 Rights Agent": "#0891B2",
  "Talent Discovery Agent": "#0369A1",
  "Audit & Logging Agent": "#6B21A8",
  "Pipeline Orchestrator": "#0B0B0F",
};

const SDG_COLORS: Record<string, string> = {
  "SDG 8": "bg-red-500/10 text-red-700",
  "SDG 10": "bg-pink-500/10 text-pink-700",
  "SDG 16": "bg-blue-500/10 text-blue-700",
};

export default function AgentDashboardPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [agentStats, setAgentStats] = useState<PerAgentStat[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgentsStatus()
      .then((data) => {
        setAgents(data.agents || []);
        setStats(data.stats || null);
        setAgentStats(data.agent_stats || []);
        setModels(data.models || []);
      })
      .catch(() => {
        setAgents([
          { name: "Compliance & Risk Agent", id: "compliance", role: "Risk assessment & policy enforcement", provider: "FLock (DeepSeek) + Z.AI (GLM)", models: ["deepseek-v3.2", "glm-4-plus"], sdg: ["SDG 10", "SDG 16"] },
          { name: "Pricing Negotiator Agent", id: "negotiator", role: "Dynamic pricing & licensing terms", provider: "FLock (Qwen3 235B)", models: ["qwen3-235b-a22b-instruct-2507"], sdg: ["SDG 8", "SDG 10"] },
          { name: "IP Contract Agent", id: "contract", role: "UK-law-compliant IP contract generation", provider: "Z.AI (GLM-4 Plus)", models: ["glm-4-plus"], sdg: ["SDG 16"] },
          { name: "Avatar Generation Agent", id: "gen_orchestrator", role: "Avatar prompt generation for Z.AI", provider: "FLock (DeepSeek V3.2)", models: ["deepseek-v3.2"], sdg: ["SDG 8"] },
          { name: "Likeness Fingerprint Agent", id: "fingerprint", role: "Unauthorized use detection & scanning", provider: "FLock (DeepSeek V3.2)", models: ["deepseek-v3.2"], sdg: ["SDG 16"] },
          { name: "Web3 Rights Agent", id: "web3_contract", role: "Blockchain IP rights (ERC-721, Polygon)", provider: "Local (Animoca)", models: [], sdg: ["SDG 16"] },
          { name: "Talent Discovery Agent", id: "search", role: "AI-driven talent discovery", provider: "FLock (DeepSeek)", models: ["deepseek-v3.2"], sdg: ["SDG 8", "SDG 10"] },
          { name: "Audit & Logging Agent", id: "audit", role: "Transaction logging & usage monitoring", provider: "Local", models: [], sdg: ["SDG 16"] },
          { name: "Pipeline Orchestrator", id: "orchestrator", role: "7-agent pipeline coordination", provider: "Local", models: [], sdg: ["SDG 8", "SDG 10", "SDG 16"] },
        ]);
        setStats({ total_actions: 0, total_tokens_used: 0, unique_agents_active: 9, licenses_processed: 0 });
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
          <Link href="/claw-console" className="font-body text-sm text-[#1E3A5F] hover:underline">
            Claw Console
          </Link>
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
          <p className="font-body text-sm text-[#6B6B73] mt-2">
            9 coordinated AI agents powered by FLock + Z.AI via OpenClaw
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-12">
          {[
            { label: "Total Actions", value: stats?.total_actions ?? 0, icon: <Activity className="w-4 h-4 text-[#1E3A5F]" /> },
            { label: "Tokens Used", value: (stats?.total_tokens_used ?? 0).toLocaleString(), icon: <Hash className="w-4 h-4 text-[#1E3A5F]" /> },
            { label: "Active Agents", value: stats?.unique_agents_active ?? 6, icon: <Zap className="w-4 h-4 text-[#1E3A5F]" /> },
            { label: "Licenses Processed", value: stats?.licenses_processed ?? 0, icon: <Globe className="w-4 h-4 text-[#1E3A5F]" /> },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-[#E0E0DA] rounded-lg p-6">
              <div className="flex items-center gap-3 mb-3">
                {s.icon}
                <span className="font-body text-xs tracking-[0.15em] uppercase text-[#6B6B73]">{s.label}</span>
              </div>
              <p className="font-display text-3xl text-[#0B0B0F]">
                {loading ? "—" : s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Agent Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {agents.map((agent) => {
            const Icon = AGENT_ICONS[agent.name] || Workflow;
            const color = AGENT_COLORS[agent.name] || "#0B0B0F";
            const agentStat = agentStats.find((s) => s.agent_name === agent.id);
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
                <h3 className="font-display text-lg text-[#0B0B0F] mb-1">{agent.name}</h3>
                <p className="font-body text-xs text-[#6B6B73] mb-3 leading-relaxed">{agent.role}</p>

                {/* SDG badges */}
                {agent.sdg && agent.sdg.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {agent.sdg.map((sdg) => (
                      <span key={sdg} className={`font-body text-[9px] px-2 py-0.5 rounded-full ${SDG_COLORS[sdg] || "bg-gray-100 text-gray-600"}`}>
                        {sdg}
                      </span>
                    ))}
                  </div>
                )}

                {/* Models used */}
                {agent.models && agent.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {agent.models.map((m) => (
                      <span key={m} className="font-body text-[9px] px-2 py-0.5 rounded bg-[#F5F5F0] text-[#6B6B73]">
                        {m}
                      </span>
                    ))}
                  </div>
                )}

                {/* Per-agent stats */}
                {agentStat && (
                  <div className="flex gap-4 text-[10px] text-[#6B6B73] font-body mb-3">
                    <span>{agentStat.total_actions} actions</span>
                    <span>{(agentStat.total_tokens || 0).toLocaleString()} tokens</span>
                  </div>
                )}

                <div className="pt-3 border-t border-[#E0E0DA]">
                  <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[#1E3A5F]">
                    {agent.provider}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Model Registry */}
        {models.length > 0 && (
          <div className="bg-white border border-[#E0E0DA] rounded-lg p-6 mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-[#1E3A5F]" />
              <p className="font-body text-xs tracking-[0.15em] uppercase text-[#1E3A5F]">Model Registry</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {models.map((m) => (
                <div key={m.tier} className="flex items-center gap-3 p-3 rounded-lg bg-[#F5F5F0]">
                  <div className={`w-2 h-2 rounded-full ${m.available ? "bg-emerald-500" : "bg-red-400"}`} />
                  <div>
                    <p className="font-body text-xs font-medium text-[#0B0B0F]">{m.model_id}</p>
                    <p className="font-body text-[10px] text-[#6B6B73]">{m.provider} / {m.tier}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pipeline Architecture */}
        <div className="bg-[#0B0B0F] rounded-lg p-8 lg:p-12 text-[#FAFAF8]">
          <p className="font-body text-xs tracking-[0.25em] uppercase text-[#FAFAF8]/40 mb-2">
            Pipeline Architecture
          </p>
          <h2 className="font-display text-2xl font-light text-[#FAFAF8] mb-8">
            OpenClaw Pipeline <span className="italic">Orchestrator</span> <span className="text-[#FAFAF8]/40 text-base">v2.0</span>
          </h2>

          {/* Pipeline Steps */}
          <div className="space-y-3 mb-10">
            {[
              { step: 1, name: "Compliance & Risk", model: "DeepSeek V3.2 + GLM-4 Summary", color: "#B45309", blocking: true, desc: "Content, brand, legal, ethical & geographic risk assessment" },
              { step: 2, name: "Pricing Negotiator", model: "Qwen3 235B Instruct", color: "#1E3A5F", blocking: false, desc: "Dynamic pricing based on talent preferences & market rates" },
              { step: 3, name: "IP Contract Generation", model: "GLM-4 Plus (Z.AI)", color: "#0F766E", blocking: false, desc: "12-section UK-law-compliant IP licensing agreement" },
              { step: 4, name: "License Token", model: "Local (UUID)", color: "#6B21A8", blocking: false, desc: "Unique license token issued for tracking" },
              { step: 5, name: "Avatar Generation", model: "DeepSeek V3.2", color: "#7C3AED", blocking: false, desc: "Detailed image/avatar prompt for licensed content" },
              { step: 6, name: "Likeness Fingerprint", model: "DeepSeek V3.2", color: "#E11D48", blocking: false, desc: "Unauthorized use detection scan across platforms" },
              { step: 7, name: "Web3 Rights", model: "Local (Polygon)", color: "#0891B2", blocking: false, desc: "ERC-721 smart contract metadata for on-chain IP rights" },
            ].map((s, i) => (
              <div key={s.step} className="flex items-stretch gap-4">
                {/* Step number + connector */}
                <div className="flex flex-col items-center w-10 flex-shrink-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-display text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: s.color }}
                  >
                    {s.step}
                  </div>
                  {i < 6 && (
                    <div className="w-0.5 flex-1 min-h-[12px] bg-gradient-to-b from-white/30 to-white/5" />
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-body text-sm font-medium text-[#FAFAF8]">{s.name}</h3>
                    {s.blocking && (
                      <span className="font-body text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 uppercase tracking-wider">Blocking</span>
                    )}
                  </div>
                  <p className="font-body text-xs text-[#FAFAF8]/50 mt-0.5">{s.desc}</p>
                  <span className="inline-block font-mono text-[10px] text-[#FAFAF8]/30 mt-1 px-2 py-0.5 rounded bg-white/5">{s.model}</span>
                </div>
              </div>
            ))}
            {/* Audit (always runs) */}
            <div className="flex items-stretch gap-4">
              <div className="flex flex-col items-center w-10 flex-shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-display text-sm font-bold flex-shrink-0 bg-white/10 border border-white/20">
                  ✓
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-body text-sm font-medium text-[#FAFAF8]">Audit & Logging</h3>
                  <span className="font-body text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">Every Step</span>
                </div>
                <p className="font-body text-xs text-[#FAFAF8]/50 mt-0.5">Immutable audit trail — agent, model, tokens, timestamp logged per action</p>
                <span className="inline-block font-mono text-[10px] text-[#FAFAF8]/30 mt-1 px-2 py-0.5 rounded bg-white/5">Local (Claw Console)</span>
              </div>
            </div>
          </div>

          {/* Short-circuit note */}
          <div className="border border-amber-500/20 rounded-lg p-4 mb-8 bg-amber-500/5">
            <p className="font-body text-xs text-amber-400">
              <span className="font-medium">Short-Circuit:</span>{" "}
              <span className="text-[#FAFAF8]/50">If Step 1 (Compliance) recommends rejection, steps 2–7 are skipped and the failure is logged.</span>
            </p>
          </div>

          {/* Infrastructure bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "FLock.io", detail: "Qwen3 235B · DeepSeek V3.2", color: "border-blue-500/30" },
              { label: "Z.AI", detail: "GLM-4 Plus (128K context)", color: "border-emerald-500/30" },
              { label: "Anyway SDK", detail: "OpenTelemetry tracing", color: "border-purple-500/30" },
              { label: "SDG Alignment", detail: "8 · 10 · 16", color: "border-amber-500/30" },
            ].map((item) => (
              <div key={item.label} className={`rounded-lg border ${item.color} bg-white/5 p-3`}>
                <p className="font-body text-[10px] tracking-[0.15em] uppercase text-[#FAFAF8]/60">{item.label}</p>
                <p className="font-body text-xs text-[#FAFAF8]/40 mt-0.5">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
