import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BYOK_PROVIDERS,
  deleteAllByokKeys,
  deleteByokApiKey,
  isByokStorageEnabled,
  listByokConfigured,
  setByokApiKey,
} from "@/lib/llm";
import type { ByokProviderId, ByokSettingsDto } from "@/lib/llm";
import { requireAuth } from "@/utils/requireAuth";

export const runtime = "nodejs";

const postSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().min(8, "API key demasiado corta"),
});

const deleteSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]).optional(),
  all: z.boolean().optional(),
});

function buildSettingsDto(
  configured: Partial<Record<ByokProviderId, { maskedKey: string }>>,
): ByokSettingsDto {
  return {
    providers: BYOK_PROVIDERS.map((meta) => ({
      provider: meta.id,
      configured: Boolean(configured[meta.id]),
      maskedKey: configured[meta.id]?.maskedKey,
    })),
  };
}

/** GET /api/settings/ia — estado BYOK (claves enmascaradas). */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  if (!isByokStorageEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: "BYOK_ENCRYPTION_KEY no configurada en el servidor.",
      ...buildSettingsDto({}),
    });
  }

  const configured = await listByokConfigured(auth.user.id);
  return NextResponse.json({ enabled: true, ...buildSettingsDto(configured) });
}

/** POST /api/settings/ia — guardar API key BYOK cifrada. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  if (!isByokStorageEnabled()) {
    return NextResponse.json(
      { message: "BYOK no habilitado: falta BYOK_ENCRYPTION_KEY." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    await setByokApiKey(auth.user.id, parsed.data.provider, parsed.data.apiKey);
    const configured = await listByokConfigured(auth.user.id);
    return NextResponse.json(buildSettingsDto(configured));
  } catch (error) {
    console.error("[settings/ia POST]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Error al guardar" },
      { status: 500 },
    );
  }
}

/** DELETE /api/settings/ia — eliminar una clave o todas. */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  if (!isByokStorageEnabled()) {
    return NextResponse.json(
      { message: "BYOK no habilitado: falta BYOK_ENCRYPTION_KEY." },
      { status: 503 },
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
  }

  if (parsed.data.all) {
    await deleteAllByokKeys(auth.user.id);
  } else if (parsed.data.provider) {
    await deleteByokApiKey(auth.user.id, parsed.data.provider);
  } else {
    return NextResponse.json(
      { message: "Indique provider o all: true" },
      { status: 400 },
    );
  }

  const configured = await listByokConfigured(auth.user.id);
  return NextResponse.json(buildSettingsDto(configured));
}