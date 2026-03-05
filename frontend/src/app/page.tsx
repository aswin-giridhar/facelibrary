"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Shield,
  FileText,
  Clock,
  Eye,
  Scale,
  Search,
  AlertTriangle,
  Handshake,
  ScrollText,
  ClipboardCheck,
  Workflow,
  ArrowRight,
  ChevronRight,
  Lock,
  User,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Timer,
  Droplets,
  FileCheck,
  Brain,
} from "lucide-react";

/* ── FL Monogram SVG ──────────────────────────────────── */
function FLMonogram({ className = "", size = 64 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
    >
      <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="1" />
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="42"
        fontStyle="italic"
        fontWeight="300"
        fill="currentColor"
      >
        FL
      </text>
    </svg>
  );
}

/* ── Trust Bar Feature Item (new: icon box style) ─────── */
function TrustFeatureItem({
  icon: Icon,
  label,
  sublabel,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E0E0DA] bg-[#F0F0EC]/50">
        <Icon className="h-5 w-5 text-[#0B0B0F]/70" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold leading-tight text-[#0B0B0F]">{label}</span>
        <span className="text-xs text-[#6B6B73]">{sublabel}</span>
      </div>
    </div>
  );
}

/* ── Role Card (new: icons, accent underline, sublabels, pill buttons) ── */
function RoleCard({
  title,
  features,
  cta,
  href,
  accent = false,
}: {
  title: string;
  features: { icon: React.ElementType; label: string; sublabel?: string }[];
  cta: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <div className="card-lift rounded-xl border border-[#E0E0DA] bg-white p-8 flex flex-col">
      <h3 className="font-display text-lg font-bold tracking-wide text-[#0B0B0F]">
        {title}
      </h3>
      <div className="mb-6 mt-2 h-0.5 w-10 bg-[#1E3A5F]" />

      <ul className="space-y-5 flex-1">
        {features.map((f) => (
          <li key={f.label} className="flex items-start gap-3">
            <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#0B0B0F]/60" />
            <div>
              <span className="text-sm font-medium text-[#0B0B0F]">{f.label}</span>
              {f.sublabel && (
                <p className="text-xs text-[#6B6B73]">{f.sublabel}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Link
          href={href}
          className={`w-full inline-flex items-center justify-center gap-2 font-body text-sm font-medium tracking-wide py-3 px-6 rounded-full transition-colors duration-300 ${
            accent
              ? "bg-[#1E3A5F] text-[#FAFAF8] hover:bg-[#1E3A5F]/90"
              : "bg-[#0B0B0F] text-[#FAFAF8] hover:bg-[#0B0B0F]/90"
          }`}
        >
          {cta}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

/* ── Pipeline Step ────────────────────────────────────── */
function PipelineStep({
  step,
  label,
  description,
  isLast = false,
}: {
  step: string;
  label: string;
  description: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 flex-1 min-w-0">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-10 h-10 rounded-full border border-[#1E3A5F] flex items-center justify-center">
          <span className="font-display text-lg text-[#1E3A5F] italic">{step}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-body text-sm font-semibold text-[#0B0B0F] tracking-wide">{label}</p>
        <p className="font-body text-xs text-[#6B6B73] mt-1 leading-relaxed">{description}</p>
      </div>
      {!isLast && (
        <ChevronRight className="w-4 h-4 text-[#1E3A5F]/40 shrink-0 mt-3 hidden lg:block" />
      )}
    </div>
  );
}

/* ── Agent Card ───────────────────────────────────────── */
function AgentCard({
  icon: Icon,
  name,
  role,
  provider,
}: {
  icon: React.ElementType;
  name: string;
  role: string;
  provider: string;
}) {
  return (
    <div className="card-lift group bg-white rounded-lg p-6 border border-[#E0E0DA] hover:border-[#1E3A5F]/30 transition-colors duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-full bg-[#0B0B0F] flex items-center justify-center agent-pulse">
          <Icon className="w-4 h-4 text-[#FAFAF8]" strokeWidth={1.5} />
        </div>
        <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[#1E3A5F] bg-[#1E3A5F]/5 px-2 py-1 rounded">
          {provider}
        </span>
      </div>
      <h4 className="font-display text-xl text-[#0B0B0F] mb-1">{name}</h4>
      <p className="font-body text-xs text-[#6B6B73] leading-relaxed">{role}</p>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] relative noise-bg">
      {/* ─── Navigation ─── */}
      <nav className="relative z-10 flex items-center justify-between px-8 lg:px-16 h-20 border-b border-[#E0E0DA] bg-white">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#0B0B0F]">
            <span className="font-display text-xl font-bold italic text-[#0B0B0F]">FL</span>
          </div>
          <div className="flex flex-col">
            <span className="font-body text-lg font-bold tracking-[0.2em] text-[#0B0B0F]">
              FACE LIBRARY
            </span>
            <span className="font-body text-[9px] font-light tracking-[0.25em] text-[#6B6B73]">
              LIKENESS INFRASTRUCTURE
            </span>
          </div>
        </Link>
        <div className="hidden lg:flex items-center gap-6">
          <Link href="#features" className="font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">Features</Link>
          <Link href="#how-it-works" className="font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">How It Works</Link>
          <Link href="#agents" className="font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">Agents</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="font-body text-sm text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className="hidden sm:inline-flex font-body text-sm font-medium text-[#FAFAF8] bg-[#0B0B0F] px-5 py-2 rounded-full hover:bg-[#0B0B0F]/90 transition-colors">
            Get Started
          </Link>
          <Link href="/claw-console" className="font-body text-sm font-medium text-[#0B0B0F] border border-[#0B0B0F] px-5 py-2 rounded-full hover:bg-[#0B0B0F] hover:text-[#FAFAF8] transition-all duration-300">
            Console
          </Link>
        </div>
      </nav>

      {/* ─── Hero (centered + image) ─── */}
      <section className="relative z-10 overflow-hidden bg-white">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E3A5F]/5 via-transparent to-transparent pointer-events-none" />

        <div className="container mx-auto flex flex-col items-center px-6 py-16 md:py-20">
          {/* Text — centered */}
          <div className="relative z-10 flex flex-col items-center text-center max-w-2xl">
            <h1 className="animate-reveal animate-reveal-1 font-display text-4xl font-semibold leading-[1.1] tracking-tight text-[#0B0B0F] md:text-5xl lg:text-6xl">
              Secure Likeness
              <br />
              <span className="italic">Licensing</span> Infrastructure
            </h1>
            <div className="animate-reveal animate-reveal-2 mt-6 flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-[#1E3A5F]" />
              <p className="text-lg text-[#6B6B73] md:text-xl">
                Control. License. Protect.
              </p>
            </div>
            <p className="animate-reveal animate-reveal-3 font-body text-base text-[#6B6B73] mt-6 max-w-lg leading-relaxed">
              The AI-powered permission and monetization layer for human identity
              in generative AI. Protect your likeness. Control your narrative.
            </p>
            <div className="animate-reveal animate-reveal-4 flex flex-wrap justify-center gap-4 mt-8">
              <Link
                href="/talent/register"
                className="inline-flex items-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium tracking-wide py-3.5 px-8 rounded-full hover:bg-[#1E3A5F] transition-colors duration-300"
              >
                Apply as Talent
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/brand/register"
                className="inline-flex items-center gap-2 border border-[#0B0B0F] text-[#0B0B0F] font-body text-sm font-medium tracking-wide py-3.5 px-8 rounded-full hover:bg-[#0B0B0F] hover:text-[#FAFAF8] transition-all duration-300"
              >
                License a Likeness
              </Link>
            </div>
          </div>

          {/* Hero image */}
          <div className="relative z-0 mt-10 w-full max-w-4xl animate-reveal animate-reveal-5">
            <Image
              src="/hero-group.png"
              alt="Face Library holographic face visualization — four digital faces rendered in blue wireframe"
              width={1200}
              height={520}
              className="w-full h-auto object-contain max-h-[520px] mx-auto"
              priority
            />
            {/* Soft fade at the bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
          </div>
        </div>
      </section>

      {/* ─── Trust Bar (static grid with icon boxes) ─── */}
      <section id="features" className="relative z-10 bg-white py-6">
        <div className="container mx-auto px-6">
          <div className="rounded-xl border border-[#E0E0DA] bg-white">
            <div className="grid grid-cols-2 divide-x divide-[#E0E0DA] md:grid-cols-3 lg:grid-cols-6">
              <TrustFeatureItem icon={FileText} label="AI-Generated" sublabel="IP-Contracts" />
              <TrustFeatureItem icon={Droplets} label="Watermarked" sublabel="Drafts" />
              <TrustFeatureItem icon={Shield} label="Escrow" sublabel="Protection" />
              <TrustFeatureItem icon={Clock} label="Time-Stamping" sublabel="& Tracking" />
              <TrustFeatureItem icon={Brain} label="AI-Protected" sublabel="Content Control" />
              <TrustFeatureItem icon={Scale} label="UK Law" sublabel="Applied" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── User Types (Role Cards with icons + sublabels + pill buttons) ─── */}
      <section className="relative z-10 px-8 lg:px-16 py-20 lg:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <p className="font-body text-xs tracking-[0.25em] uppercase text-[#1E3A5F] mb-3">
              Three Portals
            </p>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-[#0B0B0F] leading-tight">
              Built for every side of
              <br />
              <span className="italic">the licensing equation</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <RoleCard
              title="FOR TALENT"
              features={[
                { icon: User, label: "Generate Your Avatar" },
                { icon: ShieldCheck, label: "Approve Every Use" },
                { icon: ShieldAlert, label: "Restrict Ad Categories" },
                { icon: Clock, label: "Simple Time-Based Licensing" },
              ]}
              cta="Apply as Talent"
              href="/talent/register"
            />
            <RoleCard
              title="FOR AGENTS"
              features={[
                { icon: Settings, label: "Centralized Approvals" },
                { icon: FileText, label: "IP Contract Templates", sublabel: "AI can adjust & customize" },
                { icon: Timer, label: "Time-Stamping Usage Tracking" },
              ]}
              cta="Apply as Agent"
              href="/talent/register"
            />
            <RoleCard
              title="FOR BRANDS"
              features={[
                { icon: Search, label: "AI-Driven Model Search" },
                { icon: Droplets, label: "Watermarked Drafts", sublabel: "Preview Mode" },
                { icon: FileCheck, label: "IP-Generated Contract" },
              ]}
              cta="Get Started"
              href="/brand/register"
              accent
            />
          </div>
        </div>
      </section>

      {/* ─── Divider ─── */}
      <div className="relative z-10 px-8 lg:px-16">
        <div className="max-w-6xl mx-auto h-px bg-gradient-to-r from-transparent via-[#E0E0DA] to-transparent" />
      </div>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="relative z-10 px-8 lg:px-16 py-20 lg:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <p className="font-body text-xs tracking-[0.25em] uppercase text-[#1E3A5F] mb-3">
              Multi-Agent Pipeline
            </p>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-[#0B0B0F] leading-tight">
              From request to contract
              <br />
              <span className="italic">in five autonomous steps</span>
            </h2>
          </div>

          <div className="bg-white rounded-lg border border-[#E0E0DA] p-8 lg:p-12 security-pattern">
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-2">
              <PipelineStep
                step="1"
                label="Request"
                description="Brand submits a licensing request specifying use case, duration, and regions."
              />
              <PipelineStep
                step="2"
                label="Compliance Check"
                description="AI scans for risk — content policy, GDPR, geo restrictions, ethical concerns."
              />
              <PipelineStep
                step="3"
                label="Negotiation"
                description="Dynamic pricing proposed based on talent preferences and market rates."
              />
              <PipelineStep
                step="4"
                label="Contract Generation"
                description="UK-law-compliant IP contract auto-generated with all agreed terms."
              />
              <PipelineStep
                step="5"
                label="Approval"
                description="Talent reviews terms and contract, then approves or requests changes."
                isLast
              />
            </div>

            {/* Pipeline visualization bar */}
            <div className="hidden lg:block mt-8 pt-6 border-t border-[#E0E0DA]">
              <div className="flex items-center justify-between">
                <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[#6B6B73]">
                  Fully Autonomous
                </span>
                <div className="flex-1 mx-6 pipeline-line" />
                <span className="font-body text-[10px] tracking-[0.15em] uppercase text-[#6B6B73]">
                  Human-in-the-Loop
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Divider ─── */}
      <div className="relative z-10 px-8 lg:px-16">
        <div className="max-w-6xl mx-auto h-px bg-gradient-to-r from-transparent via-[#E0E0DA] to-transparent" />
      </div>

      {/* ─── Agent Showcase ─── */}
      <section id="agents" className="relative z-10 px-8 lg:px-16 py-20 lg:py-28">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <p className="font-body text-xs tracking-[0.25em] uppercase text-[#1E3A5F] mb-3">
              Powered by OpenClaw
            </p>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-[#0B0B0F] leading-tight">
              Six autonomous agents
              <br />
              <span className="italic">working in concert</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AgentCard
              icon={Handshake}
              name="Negotiator"
              role="Proposes dynamic pricing and licensing terms on behalf of talent."
              provider="Qwen3 235B"
            />
            <AgentCard
              icon={AlertTriangle}
              name="Compliance"
              role="Scans requests for content risks, GDPR compliance, and ethical concerns."
              provider="DeepSeek V3"
            />
            <AgentCard
              icon={ScrollText}
              name="Contract"
              role="Generates UK-law-compliant IP licensing contracts automatically."
              provider="GLM-4 Plus"
            />
            <AgentCard
              icon={ClipboardCheck}
              name="Audit"
              role="Logs every transaction and monitors usage patterns across the platform."
              provider="Local"
            />
            <AgentCard
              icon={Search}
              name="Search"
              role="AI-driven talent discovery matching brand requirements to creator profiles."
              provider="DeepSeek V3"
            />
            <AgentCard
              icon={Workflow}
              name="Orchestrator"
              role="Coordinates all agents through the licensing pipeline end-to-end."
              provider="Pipeline"
            />
          </div>
        </div>
      </section>

      {/* ─── Trust Bar (dark stats) ─── */}
      <section className="relative z-10 bg-[#0B0B0F] text-[#FAFAF8]">
        <div className="px-8 lg:px-16 py-16 lg:py-20">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
              <div>
                <p className="font-display text-4xl lg:text-5xl font-light italic mb-2">100%</p>
                <p className="font-body text-xs tracking-[0.2em] uppercase text-[#FAFAF8]/60">Secure &amp; Encrypted</p>
              </div>
              <div>
                <p className="font-display text-4xl lg:text-5xl font-light italic mb-2">UK Law</p>
                <p className="font-body text-xs tracking-[0.2em] uppercase text-[#FAFAF8]/60">Compliant Contracts</p>
              </div>
              <div>
                <p className="font-display text-4xl lg:text-5xl font-light italic mb-2">6 Agents</p>
                <p className="font-body text-xs tracking-[0.2em] uppercase text-[#FAFAF8]/60">Autonomous Pipeline</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative z-10 px-8 lg:px-16 py-20 lg:py-28 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#0B0B0F]/20 mx-auto mb-6">
            <span className="font-display text-2xl font-bold italic text-[#0B0B0F]/20">FL</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light text-[#0B0B0F] leading-tight mb-4">
            Your likeness,
            <br />
            <span className="italic">your terms</span>
          </h2>
          <p className="font-body text-[#6B6B73] mb-8 max-w-md mx-auto leading-relaxed">
            Join the platform where creators control how their identity is used
            in the age of generative AI.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/talent/register"
              className="inline-flex items-center gap-2 bg-[#0B0B0F] text-[#FAFAF8] font-body text-sm font-medium tracking-wide py-3.5 px-8 rounded-full hover:bg-[#1E3A5F] transition-colors duration-300"
            >
              Apply as Talent
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/brand/register"
              className="inline-flex items-center gap-2 border border-[#0B0B0F] text-[#0B0B0F] font-body text-sm font-medium tracking-wide py-3.5 px-8 rounded-full hover:bg-[#0B0B0F] hover:text-[#FAFAF8] transition-all duration-300"
            >
              License a Likeness
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer (clean, focused) ─── */}
      <footer className="relative z-10 border-t border-[#E0E0DA] bg-white">
        <div className="container mx-auto px-6 py-10">
          {/* Trust line */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 text-lg font-semibold text-[#0B0B0F]">
              <Lock className="h-5 w-5 text-[#6B6B73]" />
              <span className="text-[#1E3A5F]">100%</span>
              <span>Secure</span>
              <span className="text-[#6B6B73]">&middot;</span>
              <span className="font-bold">Time-Stamped</span>
              <span className="text-[#6B6B73]">&middot;</span>
              <span>Legally Enforceable</span>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-8 pt-6 border-t border-[#E0E0DA] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[#6B6B73]">
                <span className="font-display text-[10px] font-bold italic text-[#6B6B73]">FL</span>
              </div>
              <span className="font-body text-xs text-[#6B6B73]">
                &copy; 2026 Face Library
              </span>
            </div>
            <div className="flex items-center gap-1 font-body text-xs text-[#6B6B73]">
              <span>Powered by</span>
              <span className="font-semibold text-[#0B0B0F]">OpenClaw</span>
              <span className="mx-1">&middot;</span>
              <span className="font-semibold text-[#0B0B0F]">FLock.io</span>
              <span className="mx-1">&middot;</span>
              <span className="font-semibold text-[#0B0B0F]">Z.AI</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/agents" className="font-body text-xs text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">
                Agent Dashboard
              </Link>
              <Link href="#" className="font-body text-xs text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">
                Privacy
              </Link>
              <Link href="#" className="font-body text-xs text-[#6B6B73] hover:text-[#0B0B0F] transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
