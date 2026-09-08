import type { SpArquitectura, SpParametroArquitectura } from "@/lib/pulso/types";
import { getSpNombre, getSpParametros } from "@/lib/pulso/catalog";

/** localStorage: catálogo slim + descripcion Pulso (v3). */
export const SP_ARQUITECTURA_STORAGE_KEY = "pulso.sp.arquitectura.v3";

export const SP_ARQUITECTURA_TTL_MS = 24 * 60 * 60 * 1000;

export type SpArquitecturaStoredItem = {
  nombre: string;
  /** Descripción de negocio (comentario -- Pulso: o fallback humanizado). */
  descripcion?: string;
  parametros: SpParametroArquitectura[];
};

export type SpArquitecturaStored = {
  fetchedAt: number;
  sps: SpArquitecturaStoredItem[];
};

export function toStoredArquitectura(catalog: SpArquitectura[]): SpArquitecturaStored {
  return {
    fetchedAt: Date.now(),
    sps: catalog.map((sp) => ({
      nombre: getSpNombre(sp),
      descripcion: (sp.descripcion ?? sp.description)?.trim() || undefined,
      parametros: getSpParametros(sp).map((p) => ({
        nombre: p.nombre,
        tipo: p.tipo ?? p.type,
        requerido: p.requerido ?? p.required,
        ...(p.tieneDefault !== undefined ? { tieneDefault: p.tieneDefault } : {}),
        esOutput: false,
      })),
    })),
  };
}

export function saveSpArquitecturaToStorage(data: SpArquitecturaStored): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SP_ARQUITECTURA_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}

export function loadSpArquitecturaFromStorage(): SpArquitecturaStored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SP_ARQUITECTURA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpArquitecturaStored;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.sps)) return null;
    if (Date.now() - parsed.fetchedAt > SP_ARQUITECTURA_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Quita el catálogo del localStorage (logout / sesión inválida). */
export function clearSpArquitecturaStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SP_ARQUITECTURA_STORAGE_KEY);
  } catch {
    // private mode / quota
  }
}

/** Sincroniza SPs_arquitectura vía proxy Next.js y persiste en localStorage. */
export async function syncSpArquitecturaFromApi(token: string): Promise<SpArquitecturaStored | null> {
  const response = await fetch("/api/pulso/arquitectura", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as SpArquitecturaStored;
  saveSpArquitecturaToStorage(data);
  return data;
}
