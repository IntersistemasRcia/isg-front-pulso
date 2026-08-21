"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LoginCredentials, User } from "@/types";
import {
  api,
  clearAuthStorage,
  getStoredToken,
  getStoredUserJson,
  storeToken,
  storeUserJson,
} from "@/utils/api";
import { isTokenExpired, mapPayloadToUser } from "@/utils/auth";
import { decodeJwt } from "jose";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function hydrateUserFromToken(token: string, partial?: Partial<User>): User {
  const payload = decodeJwt(token);
  return {
    ...mapPayloadToUser(payload as Parameters<typeof mapPayloadToUser>[0]),
    ...partial,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = getStoredToken();
    const storedUser = getStoredUserJson();

    if (!storedToken || isTokenExpired(storedToken)) {
      clearAuthStorage();
      setIsLoading(false);
      return;
    }

    try {
      const parsedUser = storedUser ? (JSON.parse(storedUser) as User) : hydrateUserFromToken(storedToken);
      setToken(storedToken);
      setUser(parsedUser);
    } catch {
      clearAuthStorage();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { data } = await api.post<{
      token: string;
      expiresAt?: string;
      user?: Partial<User>;
    }>("/api/auth/login", credentials);

    if (!data.token) {
      throw new Error("La API Auth no devolvió un token");
    }

    if (isTokenExpired(data.token)) {
      throw new Error("El token recibido ya está expirado");
    }

    const nextUser = hydrateUserFromToken(data.token, data.user);
    storeToken(data.token);
    storeUserJson(JSON.stringify(nextUser));
    setToken(data.token);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
