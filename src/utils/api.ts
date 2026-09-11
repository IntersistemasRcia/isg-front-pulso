import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import {
  AUTH_COOKIE_NAME,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from "@/utils/constants";
import { normalizeAuthToken } from "@/utils/auth";

/** Base URL relativa o configurada por instancia on-premise. */
const baseURL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "";

export const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60_000,
  withCredentials: true,
});

/** Lee el JWT desde localStorage (fallback cliente). */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  const normalized = normalizeAuthToken(raw);
  return normalized || null;
}

/**
 * Persiste JWT en localStorage.
 * La cookie de sesión la setea el server (HttpOnly) en POST /api/auth/login.
 * Se limpia cualquier cookie no-HttpOnly legada que pudiera corromper el JWT (+ → espacio).
 */
export function storeToken(token: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeAuthToken(token);
  window.localStorage.setItem(TOKEN_STORAGE_KEY, normalized);
  // Evita cookie client-side vieja compitiendo con la HttpOnly del login.
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

/** Elimina token y datos de sesión en el cliente. */
export function clearAuthStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

/** Invalida la cookie HttpOnly de sesión en el servidor. */
export async function clearAuthCookie(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // ignore network errors on logout
  }
}

export function getStoredUserJson(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_STORAGE_KEY);
}

export function storeUserJson(userJson: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_STORAGE_KEY, userJson);
}

export type AuthFetchInit = RequestInit & {
  /** JWT explícito; si omite, usa localStorage. */
  token?: string | null;
  /** Reintentos ante 401 (carrera post-login). Default 1. */
  authRetries?: number;
};

/**
 * fetch autenticado: Bearer + credentials + un reintento ante 401.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: AuthFetchInit = {},
): Promise<Response> {
  const { token: tokenOpt, authRetries = 1, ...rest } = init;
  const token = (tokenOpt ?? getStoredToken()) || null;

  const headers = new Headers(rest.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const execute = () =>
    fetch(input, {
      ...rest,
      headers,
      credentials: rest.credentials ?? "same-origin",
      cache: rest.cache ?? "no-store",
    });

  let response = await execute();
  let left = authRetries;
  while (response.status === 401 && token && left > 0) {
    left -= 1;
    await new Promise((r) => setTimeout(r, 200));
    response = await execute();
  }
  return response;
}

/**
 * Interceptor: adjunta Authorization Bearer en cada request al backend local.
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const url = String(error.config?.url ?? "");
      // No limpiar sesión ante fallo del propio login.
      if (url.includes("/api/auth/login")) {
        return Promise.reject(error);
      }
      // Solo invalidar si realmente había sesión (evita wipe por race sin Bearer).
      if (getStoredToken()) {
        clearAuthStorage();
        void clearAuthCookie();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);
