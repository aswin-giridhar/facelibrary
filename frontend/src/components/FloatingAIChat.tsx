"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, User, MessageCircle, Loader2 } from "lucide-react";
import { postChat, type ChatMessage, type ChatVariant } from "@/lib/api";

interface FloatingAIChatProps {
  variant?: ChatVariant;
}

const VARIANT_CONFIG: Record<ChatVariant, {
  title: string;
  description: string;
  welcome: string;
  placeholder: string;
  quickActions: { label: string; prompt: string }[];
}> = {
  client: {
    title: "AI Campaign Assistant",
    description: "Find talent, create offers, and generate contracts using AI.",
    welcome: "Hi! I can help you find the right talent or create a campaign. What are you looking for?",
    placeholder: "Describe your campaign or request…",
    quickActions: [
      { label: "Find Talent", prompt: "Find beauty & fashion talent available in the UK for a spring campaign." },
      { label: "Draft Offer", prompt: "Help me draft an offer for Emma Clarke: 90-day social + web campaign in the UK." },
      { label: "Explain Contract", prompt: "Explain the difference between standard, exclusive, and time-limited licenses." },
    ],
  },
  agent: {
    title: "AI Agent Assistant",
    description: "Manage talent, review deals, and analyze IP rights.",
    welcome: "Hello! I'm your AI Agent Assistant. I can help you generate contracts, review licensing deals, analyze talent performance, and manage IP rights. How can I assist you today?",
    placeholder: "Ask about contracts, deals, or IP rights…",
    quickActions: [
      { label: "Review Deals", prompt: "Walk me through what to check when reviewing a new license request on behalf of my talent." },
      { label: "Draft Contract", prompt: "Draft suggested clauses for a UK exclusive fashion license, 180 days, no AI training." },
      { label: "Counter-offer", prompt: "Help me write a firm but fair counter-offer to a brand asking for 30% below our min price." },
    ],
  },
  talent: {
    title: "AI Talent Assistant",
    description: "Manage your profile, review requests, and track earnings.",
    welcome: "Hi! I'm your AI Talent Assistant. I can help you review incoming requests, understand contract terms, and optimize your profile. What do you need?",
    placeholder: "Ask about requests, earnings, or profile…",
    quickActions: [
      { label: "Should I sign?", prompt: "What should I check before signing a license request from a brand I don't know?" },
      { label: "Contract terms", prompt: "Explain in plain English what 'exclusive license in the beauty category' means for me." },
      { label: "Profile tips", prompt: "How can I make my talent profile stand out to brands in the fashion category?" },
    ],
  },
};

export function FloatingAIChat({ variant = "client" }: FloatingAIChatProps) {
  const cfg = VARIANT_CONFIG[variant];
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: cfg.welcome },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);

    // Cap history at 50 to prevent unbounded growth (also matches backend limit).
    const history: ChatMessage[] = [...messages, { role: "user" as const, content: text }].slice(-50);
    setMessages(history);
    setInput("");
    setSending(true);

    try {
      const res = await postChat(variant, history);
      setMessages((prev) => [...prev, { role: "assistant" as const, content: res.reply }].slice(-50));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center z-50 group"
          aria-label="Open AI Assistant"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[90vw] sm:w-[380px] h-[600px] max-h-[calc(100vh-3rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 flex flex-col">
          <div className="bg-black text-white px-5 py-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                <Bot className="w-6 h-6 text-black" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{cfg.title}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span className="text-xs text-gray-300">Online</span>
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-300 transition-colors" aria-label="Close chat">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-xs text-gray-600">{cfg.description}</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] p-3 rounded-lg text-sm whitespace-pre-line ${
                    msg.role === "user" ? "bg-black text-white rounded-br-none" : "bg-gray-100 text-gray-900 rounded-bl-none"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="bg-gray-100 text-gray-600 p-3 rounded-lg rounded-bl-none flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">Quick Actions</p>
            <div className="flex gap-2 flex-wrap">
              {cfg.quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => setInput(action.prompt)}
                  disabled={sending}
                  className="flex-1 text-xs bg-white border border-gray-200 text-black px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-200 bg-white rounded-b-2xl">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={cfg.placeholder}
                disabled={sending}
                className="w-full border border-gray-300 rounded-lg p-3 pr-12 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-50"
                rows={2}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || sending}
                className="absolute right-2 bottom-2 bg-black text-white p-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Press Enter to send</p>
          </div>
        </div>
      )}
    </>
  );
}
