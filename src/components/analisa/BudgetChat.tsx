import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { MessageCircle, Send, Loader2, Sparkles } from "lucide-react";
import type { ReviewResult } from "./ReviewResultCards";
import type { BudgetItem } from "./BudgetPlanner";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getErrorMessage } from "@/lib/errors";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface BudgetChatProps {
  result: ReviewResult;
  alreadySent: boolean;
  selectedItems: BudgetItem[];
  budget: number;
}

export default function BudgetChat({ result, alreadySent, selectedItems, budget }: BudgetChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const buildContext = () => {
    const cards = result.cards;
    const kurang = cards.filter(c => c.verdict === "kurang");
    const lebih = cards.filter(c => c.verdict === "lebih");

    return `KONTEKS REVIEW RESTOK:
- Total ${cards.length} item di-review, skor ${result.score}/10
- ${kurang.length} item perlu ditambah, ${lebih.length} item lebih pesan, ${result.missed.length} belum masuk dari ringkasan
- Budget pesanan awal: Rp ${result.total_cost.toLocaleString("id-ID")}
- Budget tambahan (kurang): Rp ${(result.budget_tambah || 0).toLocaleString("id-ID")}
- Budget belum masuk dari ringkasan: Rp ${(result.budget_missed || 0).toLocaleString("id-ID")}
- Total final: Rp ${(result.budget_total || 0).toLocaleString("id-ID")}
${budget > 0 ? `- Sisa budget Boss: Rp ${budget.toLocaleString("id-ID")}` : "- Boss belum input sisa budget"}
${selectedItems.length > 0 ? `- Item terpilih (${selectedItems.length}): ${selectedItems.map(i => `${i.kode} +${i.qty}pcs (Rp ${i.cost.toLocaleString("id-ID")})`).join(", ")}` : ""}
${alreadySent ? "- Pesanan SUDAH dikirim, tidak bisa dikurangi" : "- Pesanan BELUM dikirim"}
${result.review_basis ? `- Patokan review: ${result.review_basis}` : ""}

DETAIL ITEM KURANG:
${kurang.map(c => `${c.kode} (${c.nama}): pesan ${c.qty_boss}, ideal ${c.ideal_qty}, DOS ${c.dos} hari, velocity ${c.velocity}/hari, modal Rp ${c.harga_modal.toLocaleString("id-ID")}`).join("\n")}

ITEM BELUM MASUK DARI RINGKASAN:
${result.missed.map(m => `${m.kode} (${m.nama}): stok ${m.stok}, DOS ${m.dos} hari, velocity ${m.velocity}/hari, ideal ${m.ideal_qty} pcs`).join("\n")}`;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/budget-chat`,
        {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            messages: newMessages,
            context: buildContext(),
          }),
        }
      );

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      // Stream response
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";

      const updateAssistant = (content: string) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              updateAssistant(assistantContent);
            }
          } catch { 
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (const raw of textBuffer.split("\n")) {
          if (!raw || !raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              updateAssistant(assistantContent);
            }
          } catch {
            // Ignore malformed trailing event chunks.
          }
        }
      }
    } catch (err: unknown) {
      console.error("Budget chat error:", err);
      console.error("Budget chat message:", getErrorMessage(err));
      setMessages(prev => [...prev, { role: "assistant", content: "Maaf Boss, ada error. Coba lagi ya." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendQuickQuestion = async (q: string) => {
    if (isLoading) return;
    const userMsg: ChatMessage = { role: "user", content: q };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/budget-chat`,
        {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ messages: newMessages, context: buildContext() }),
        }
      );

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";

      const updateAssistant = (content: string) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) { assistantContent += content; updateAssistant(assistantContent); }
          } catch { textBuffer = line + "\n" + textBuffer; break; }
        }
      }
    } catch (err: unknown) {
      console.error("Budget chat error:", err);
      console.error("Budget chat message:", getErrorMessage(err));
      setMessages(prev => [...prev, { role: "assistant", content: "Maaf Boss, ada error. Coba lagi ya." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    "Kalau budget cuma segini, mana yang paling penting?",
    "Item mana yang bisa di-skip dulu?",
    "Ada saran biar lebih hemat?",
  ];

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border-2 border-dashed border-primary/30 hover:border-primary/60 text-sm font-bold text-primary transition-all active:scale-[0.98]"
      >
        <MessageCircle className="h-4 w-4" />
        Diskusi Budget dengan AI
      </button>
    );
  }

  return (
    <Card className="card-premium overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-primary/10 to-transparent border-b flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Diskusi Budget</h4>
            <p className="text-[10px] text-muted-foreground">Tanya AI soal budget & prioritas restok</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="max-h-[300px] overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center py-2">
                Tanya apa aja soal budget restok Boss 👇
              </p>
              <div className="space-y-1.5">
                {quickQuestions.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sendQuickQuestion(q)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none [&_p]:m-0 [&_p]:mb-1.5 [&_ol]:m-0 [&_ol]:pl-4 [&_ul]:m-0 [&_ul]:pl-4 [&_li]:m-0 [&_li]:mb-1 [&_strong]:text-foreground [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t bg-muted/20">
          <form onSubmit={e => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Tanya soal budget..."
              className="flex-1 h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 rounded-xl shrink-0"
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
