import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_HEADER,
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
 * La API autentica con Authorization y x-pulso-token (IIS no suele strippear este último).
 * La cookie HttpOnly la setea POST /api/auth/login (middleware del dashboard).
 */
export function storeToken(token: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeAuthToken(token);
  window.localStorage.setItem(TOKEN_STORAGE_KEY, normalized);
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

/** Adjunta Authorization + x-pulso-token (IIS-safe) a un Headers. */
export function applyAuthHeaders(headers: Headers, token: string): void {
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has(AUTH_TOKEN_HEADER)) {
    headers.set(AUTH_TOKEN_HEADER, token);
  }
}

export type AuthFetchInit = RequestInit & {
  /** JWT explícito; si omite, usa localStorage. */
  token?: string | null;
  /** Reintentos ante 401 (carrera post-login). Default 1. */
  authRetries?: number;
};

/**
 * fetch autenticado: Bearer + x-pulso-token + credentials + reintento ante 401.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: AuthFetchInit = {},
): Promise<Response> {
  const { token: tokenOpt, authRetries = 1, ...rest } = init;
  const token = (tokenOpt ?? getStoredToken()) || null;

  const headers = new Headers(rest.headers);
  if (token) applyAuthHeaders(headers, token);

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
 * Espera a que el servidor acepte el JWT (cookie o headers).
 * Útil post-login detrás de IIS/ARR antes de entrar al dashboard.
 */
export async function waitForAuthSession(
  token: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  const attempts = opts.attempts ?? 10;
  const delayMs = opts.delayMs ?? 100;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await authFetch("/api/auth/session", {
        token,
        authRetries: 0,
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Interceptor: adjunta Authorization + x-pulso-token.
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers[AUTH_TOKEN_HEADER] = token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const url = String(error.config?.url ?? "");
      if (url.includes("/api/auth/login") || url.includes("/api/auth/session")) {
        return Promise.reject(error);
      }
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
