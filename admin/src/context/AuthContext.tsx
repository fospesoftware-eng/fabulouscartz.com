import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LoginResponse, User } from "../../shared/types";
import { api } from "../lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const result = await api.get<{ user: User }>("/auth/me");
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => setUser(null);
    window.addEventListener("fc:unauthorized", onUnauthorized);
    return () => window.removeEventListener("fc:unauthorized", onUnauthorized);
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.post<LoginResponse>("/auth/login", { email, password });
    setUser(result.user);
    return result.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.post("/auth/password", { currentPassword, newPassword });
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
