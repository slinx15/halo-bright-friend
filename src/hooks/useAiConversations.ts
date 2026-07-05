import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type Msg = { role: "user" | "assistant"; content: string };

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function useAiConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("ai_conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    setConversations(data || []);
  }, [user]);

  useEffect(() => {
    loadConversations().catch((error) => {
      console.error("Failed to load conversations:", error);
    });
  }, [loadConversations]);

  // Load messages for a conversation
  const loadMessages = useCallback(async (convId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages((data || []) as Msg[]);
      setActiveId(convId);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new conversation
  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (!user) return null;
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "..." : "");
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !data) return null;
    setActiveId(data.id);
    await loadConversations();
    return data.id;
  }, [user, loadConversations]);

  // Save a message
  const saveMessage = useCallback(async (convId: string, role: "user" | "assistant", content: string) => {
    const { error: insertError } = await supabase.from("ai_messages").insert({ conversation_id: convId, role, content });
    if (insertError) throw insertError;
    // Update conversation timestamp
    const { error: updateError } = await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    if (updateError) throw updateError;
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (convId: string) => {
    const { error } = await supabase.from("ai_conversations").delete().eq("id", convId);
    if (error) throw error;
    if (activeId === convId) { setActiveId(null); setMessages([]); }
    await loadConversations();
  }, [activeId, loadConversations]);

  // Start new chat
  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
  }, []);

  return { conversations, activeId, messages, setMessages, loading, loadConversations, loadMessages, createConversation, saveMessage, deleteConversation, newChat };
}
