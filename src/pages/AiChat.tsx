import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, User, Sparkles, Trash2, Plus, MessageSquare, Brain, X, ChevronLeft, Search, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAiConversations, type Msg } from "@/hooks/useAiConversations";
import { useAiMemories } from "@/hooks/useAiMemories";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getErrorMessage } from "@/lib/errors";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

const CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;

const CHAT_PROMPTS = [
  "Produk mana yang harus segera di-restock?",
  "Ringkasan penjualan 7 hari terakhir",
  "Kasih ide buat naikin omzet minggu ini",
  "Stok mana yang paling kritis?",
];

const RESEARCH_PROMPTS = [
  "Riset harga benang obras Ivory 2 ons di Shopee, siapa kompetitornya?",
  "Analisis warna-warna benang yang paling laku di marketplace",
  "Strategi lengkap jualan benang di Shopee dari nol",
  "Riset kompetitor toko benang online, harga & positioning mereka",
];

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  keputusan: { label: "Keputusan", emoji: "\u2705" },
  project: { label: "Project", emoji: "\u{1F4CB}" },
  target: { label: "Target", emoji: "\u{1F3AF}" },
  catatan: { label: "Catatan", emoji: "\u{1F4DD}" },
  ide: { label: "Ide", emoji: "\u{1F4A1}" },
};

const AiChat = () => {
  const isMobile = useIsMobile();
  const { conversations, activeId, messages, setMessages, loadMessages, createConversation, saveMessage, deleteConversation, newChat } = useAiConversations();
  const { memories, deleteMemory, extractMemories } = useAiMemories();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [showMemory, setShowMemory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);
    if (isMobile) setShowSidebar(false);

    let convId = activeId;
    if (!convId) {
      convId = await createConversation(text.trim());
      if (!convId) { toast.error("Gagal membuat percakapan"); setIsLoading(false); return; }
    }

    // Save user message
    await saveMessage(convId, "user", text.trim());

    let assistantSoFar = "";
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ messages: allMessages, conversation_id: convId, research_mode: researchMode }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Gagal menghubungi AI" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }
      if (!resp.body) throw new Error("No stream body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }

      // Flush remaining
      if (buffer.trim()) {
        for (const raw of buffer.split("\n")) {
          if (!raw || raw.startsWith(":") || !raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch { /* skip */ }
        }
      }

      // Save assistant message
      if (assistantSoFar) {
        await saveMessage(convId, "assistant", assistantSoFar);
        // Extract memories in background
        extractMemories([...allMessages, { role: "assistant", content: assistantSoFar }], convId);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Gagal menghubungi AI"));
      if (!assistantSoFar) setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, isLoading, activeId, createConversation, saveMessage, setMessages, extractMemories, isMobile, researchMode]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] max-w-[1400px] mx-auto w-full">
      {/* Sidebar - Conversation List */}
      {showSidebar && (
        <div className={`${isMobile ? "absolute inset-0 z-50 bg-background" : "w-72 border-r border-border"} flex flex-col`}>
          <div className="p-3 flex items-center justify-between border-b border-border">
            <h3 className="font-bold text-sm">Percakapan</h3>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMemory(!showMemory)}>
                <Brain className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { newChat(); if (isMobile) setShowSidebar(false); }}>
                <Plus className="h-4 w-4" />
              </Button>
              {isMobile && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSidebar(false)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {showMemory ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Memory AI ({memories.length})</h4>
              {memories.length === 0 && <p className="text-xs text-muted-foreground">Belum ada memory. AI akan otomatis menyimpan hal-hal penting dari percakapan.</p>}
              {memories.map(m => (
                <div key={m.id} className="text-xs bg-muted/40 rounded-lg p-2.5 group relative">
                  <div className="flex items-center gap-1 mb-1">
                    <span>{CATEGORY_LABELS[m.category]?.emoji || "\u{1F4CC}"}</span>
                    <span className="font-semibold text-[10px] uppercase text-muted-foreground">{CATEGORY_LABELS[m.category]?.label || m.category}</span>
                  </div>
                  <p className="leading-relaxed">{m.content}</p>
                  <button onClick={() => deleteMemory(m.id)} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {conversations.map(c => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors group ${activeId === c.id ? "bg-muted/60" : ""}`}
                  onClick={() => { loadMessages(c.id); if (isMobile) setShowSidebar(false); }}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{c.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {conversations.length === 0 && <p className="text-xs text-muted-foreground text-center p-4">Belum ada percakapan</p>}
            </div>
          )}
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 pb-2 flex items-center gap-3">
          {(!showSidebar || isMobile) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShowSidebar(true)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="p-2 rounded-xl bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold tracking-tight">AI Partner Bisnis</h1>
            <p className="text-muted-foreground text-xs truncate">Asisten pribadi RRCollections | {memories.length} memory tersimpan</p>
          </div>
          <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1">
            <button
              onClick={() => setResearchMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!researchMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat
            </button>
            <button
              onClick={() => setResearchMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${researchMode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Search className="h-3.5 w-3.5" />
              Riset
            </button>
           </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-3 pb-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-5 py-8">
              <div className={`p-4 rounded-2xl ${researchMode ? "bg-primary/10" : "bg-primary/5"}`}>
                {researchMode ? <Search className="h-10 w-10 text-primary" /> : <Sparkles className="h-10 w-10 text-primary" />}
              </div>
              <div className="text-center space-y-1">
                <h2 className="font-bold text-lg">
                  {researchMode ? `Mode Riset Mendalam ${"\u{1F50D}"}` : `Halo Boss! ${"\u{1F44B}"}`}
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {researchMode
                    ? "Tanya apa saja soal riset pasar - harga kompetitor, tren warna, strategi Shopee, analisis produk. AI akan memberikan analisis mendalam!"
                    : `Tanya apa saja - stok, penjualan, ide bisnis, strategi marketing, atau curhat soal bisnis. Saya ingat semua percakapan kita ${"\u{1F9E0}"}`}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {(researchMode ? RESEARCH_PROMPTS : CHAT_PROMPTS).map(prompt => (
                  <button key={prompt} onClick={() => sendMessage(prompt)} className="text-left text-sm px-4 py-3 rounded-xl border border-border/60 hover:bg-muted/60 hover:shadow-sm transition-all duration-150 active:scale-[0.98]">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="shrink-0 mt-1"><div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center"><Bot className="h-4 w-4 text-primary" /></div></div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted/60 rounded-bl-md"}`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <SimpleMarkdown text={msg.content} />
                  </div>
                ) : msg.content}
              </div>
              {msg.role === "user" && (
                <div className="shrink-0 mt-1"><div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center"><User className="h-4 w-4 text-muted-foreground" /></div></div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-2.5">
              <div className="shrink-0 mt-1"><div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center"><Bot className="h-4 w-4 text-primary" /></div></div>
              <div className="bg-muted/60 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 pt-2 pb-20 md:pb-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder={researchMode ? "Riset apa? (misal: harga benang Ivory di Shopee)" : "Tanya AI tentang bisnis kamu..."} disabled={isLoading} className="rounded-xl h-12 text-base" autoComplete="off" />
            <Button type="submit" disabled={isLoading || !input.trim()} className="rounded-xl h-12 w-12 shrink-0 press-scale">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ─── Simple Markdown Renderer ───
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) elements.push(<h3 key={i} className="font-bold text-base mt-3 mb-1">{formatInline(line.slice(4))}</h3>);
    else if (line.startsWith("## ")) elements.push(<h2 key={i} className="font-bold text-lg mt-3 mb-1">{formatInline(line.slice(3))}</h2>);
    else if (line.startsWith("# ")) elements.push(<h1 key={i} className="font-extrabold text-xl mt-3 mb-1">{formatInline(line.slice(2))}</h1>);
    else if (/^[-*]\s/.test(line)) elements.push(<div key={i} className="flex gap-2 items-start pl-1"><span className="text-muted-foreground mt-0.5">-</span><span>{formatInline(line.replace(/^[-*]\s/, ""))}</span></div>);
    else if (/^\d+\.\s/.test(line)) { const num = line.match(/^(\d+)\./)?.[1]; elements.push(<div key={i} className="flex gap-2 items-start pl-1"><span className="text-muted-foreground font-semibold mt-0.5">{num}.</span><span>{formatInline(line.replace(/^\d+\.\s/, ""))}</span></div>); }
    else if (line.trim() === "") elements.push(<div key={i} className="h-2" />);
    else elements.push(<p key={i}>{formatInline(line)}</p>);
  }
  return <>{elements}</>;
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith("`") && cp.endsWith("`")) return <code key={`${i}-${j}`} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{cp.slice(1, -1)}</code>;
      return cp;
    });
  });
}

export default AiChat;
