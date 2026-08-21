import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import {
  AUTH_COOKIE_NAME,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from "@/utils/constants";

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
});

/** Lee el JWT desde localStorage (fallback cliente). */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

/** Persiste JWT en localStorage y cookie (para middleware). */
export function storeToken(token: string, maxAgeSeconds = 60 * 60 * 8): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

/** Elimina token y datos de sesión. */
export function clearAuthStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

export function getStoredUserJson(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_STORAGE_KEY);
}

export function storeUserJson(userJson: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_STORAGE_KEY, userJson);
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
      clearAuthStorage();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
