"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LoginCredentials, User } from "@/types";
import {
  api,
  clearAuthCookie,
  clearAuthStorage,
  getStoredToken,
  getStoredUserJson,
  storeToken,
  storeUserJson,
  waitForAuthSession,
} from "@/utils/api";
import { isTokenExpired, mapPayloadToUser, normalizeAuthToken } from "@/utils/auth";
import { clearSpArquitecturaStorage } from "@/lib/pulso/arquitecturaStorage";
import { decodeJwt } from "jose";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** true cuando /api/auth/session aceptó el JWT (listo para status/providers). */
  sessionReady: boolean;
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
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const storedToken = getStoredToken();
      const storedUser = getStoredUserJson();

      if (!storedToken || isTokenExpired(storedToken)) {
        clearAuthStorage();
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const parsedUser = storedUser
          ? (JSON.parse(storedUser) as User)
          : hydrateUserFromToken(storedToken);

        const ok = await waitForAuthSession(storedToken, {
          attempts: 8,
          delayMs: 100,
        });
        if (cancelled) return;

        if (!ok) {
          clearAuthStorage();
          void clearAuthCookie();
          setIsLoading(false);
          return;
        }

        setToken(storedToken);
        setUser(parsedUser);
        setSessionReady(true);
      } catch {
        clearAuthStorage();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
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

    const accessToken = normalizeAuthToken(data.token);
    if (!accessToken) {
      throw new Error("La API Auth devolvió un token vacío");
    }

    if (isTokenExpired(accessToken)) {
      throw new Error("El token recibido ya está expirado");
    }

    const nextUser = hydrateUserFromToken(accessToken, data.user);
    storeToken(accessToken);
    storeUserJson(JSON.stringify(nextUser));

    const ok = await waitForAuthSession(accessToken, {
      attempts: 15,
      delayMs: 100,
    });
    if (!ok) {
      clearAuthStorage();
      throw new Error(
        "El servidor no aceptó la sesión. Si está detrás de IIS, revise que no elimine headers de autenticación.",
      );
    }

    setToken(accessToken);
    setUser(nextUser);
    setSessionReady(true);
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    clearSpArquitecturaStorage();
    setToken(null);
    setUser(null);
    setSessionReady(false);
    void clearAuthCookie();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user && sessionReady),
      isLoading,
      sessionReady,
      login,
      logout,
    }),
    [user, token, isLoading, sessionReady, login, logout],
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
