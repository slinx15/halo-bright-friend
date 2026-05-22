import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getAuthHeaders } from "@/lib/authHeaders";
import { SUPABASE_URL } from "@/lib/supabaseEnv";

export interface AiMemory {
  id: string;
  category: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

export function useAiMemories() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<AiMemory[]>([]);

  const loadMemories = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_memories")
      .select("id, category, content, is_active, created_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(100);
    setMemories(data || []);
  }, [user]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const deleteMemory = useCallback(async (id: string) => {
    await supabase.from("ai_memories").update({ is_active: false }).eq("id", id);
    setMemories(prev => prev.filter(m => m.id !== id));
  }, []);

  // Trigger memory extraction via edge function
  const extractMemories = useCallback(async (messages: { role: string; content: string }[], conversationId: string | null) => {
    if (messages.length < 2) return;
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ messages, conversation_id: conversationId, extract_memories: true }),
      });
      // Reload memories after extraction
      setTimeout(() => loadMemories(), 2000);
    } catch { /* silently fail */ }
  }, [loadMemories]);

  return { memories, loadMemories, deleteMemory, extractMemories };
}
