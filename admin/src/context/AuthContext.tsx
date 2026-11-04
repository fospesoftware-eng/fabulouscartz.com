import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LoginResponse, User } from "../../shared/types";
import { api, clearTokens, getStoredTokens, storeTokens } from "../lib/api";

interface TokenPayload {
  tokens?: { accessToken: string; refreshToken: string };
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    const result = await api.get<{ user: User }>("/auth/me");
    return result.user;
  };

  const refresh = async () => {
    if (!getStoredTokens()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await fetchMe());
    } catch {
      /* api.ts already refreshed once on a 401; a second failure means signed out */
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => {
      clearTokens();
      setUser(null);
    };
    window.addEventListener("fc:unauthorized", onUnauthorized);
    return () => window.removeEventListener("fc:unauthorized", onUnauthorized);
  }, []);

  const login = async (username: string, password: string) => {
    const result = await api.post<LoginResponse & TokenPayload>("/auth/login", { username, password });
    if (result.tokens) storeTokens(result.tokens);
    setUser(result.user);
    return result.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* the session may already be gone */
    } finally {
      clearTokens();
      setUser(null);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const result = await api.post<LoginResponse & TokenPayload>("/auth/password", { currentPassword, newPassword });
    if (result.tokens) storeTokens(result.tokens);
    if (result.user) setUser(result.user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
