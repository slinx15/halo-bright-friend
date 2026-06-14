import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const fetchRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      console.log("[fetchRole]", { userId, data, error });
      if (error) {
        console.error("[fetchRole] error:", error.message);
        return null;
      }
      return data?.role ?? null;
    } catch (e) {
      console.error("[fetchRole] catch:", e);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Safety timeout
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    // INITIAL load
    const initializeAuth = async () => {
      try {
        const { data: { session: initSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(initSession);
        setUser(initSession?.user ?? null);

        if (initSession?.user) {
          const userRole = await fetchRole(initSession.user.id);
          if (mounted) setRole(userRole);
        }
      } catch (e) {
        console.error("[initializeAuth] error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // Listener for ONGOING auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;
        if (event === "INITIAL_SESSION") return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Use setTimeout to avoid deadlock with Supabase auth
          setTimeout(() => {
            if (!mounted) return;
            fetchRole(newSession.user.id).then((userRole) => {
              if (mounted) setRole(userRole);
            });
          }, 0);
        } else {
          setRole(null);
        }
        if (mounted) setLoading(false);
      }
    );

    initializeAuth();

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
