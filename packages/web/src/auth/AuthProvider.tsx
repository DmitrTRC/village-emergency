import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@village/shared";
import { refreshSession } from "../api/endpoints";
import { clear, getAccess, loadRefresh, setTokens, type TokenPair } from "./session";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export type AuthStatus = "loading" | "authed" | "anon";

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  setSession: (pair: TokenPair, user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (getAccess()) {
        if (!cancelled) setStatus("authed");
        return;
      }
      const refresh = await loadRefresh();
      if (!refresh) {
        if (!cancelled) setStatus("anon");
        return;
      }
      try {
        const pair = await refreshSession(refresh);
        await setTokens(pair);
        if (!cancelled) setStatus("authed");
      } catch {
        await clear();
        if (!cancelled) setStatus("anon");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = async (pair: TokenPair, nextUser: SessionUser) => {
    await setTokens(pair);
    setUser(nextUser);
    setStatus("authed");
  };

  const signOut = async () => {
    await clear();
    setUser(null);
    setStatus("anon");
  };

  return (
    <AuthContext.Provider value={{ status, user, setSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
