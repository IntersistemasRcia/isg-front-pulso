import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { ByokProviderId } from "./types";
import { BYOK_PROVIDERS } from "./registry";

const BYOK_DIR = path.join(process.cwd(), "data", "byok");
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT = "pulso-byok-v1";

interface EncryptedBlob {
  iv: string;
  tag: string;
  data: string;
}

interface ByokFilePayload {
  version: 1;
  providers: Partial<Record<ByokProviderId, EncryptedBlob>>;
}

function deriveKey(): Buffer {
  const secret = process.env.BYOK_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("BYOK_ENCRYPTION_KEY no configurada");
  }
  return scryptSync(secret, SALT, KEY_LENGTH);
}

function encryptPlaintext(plaintext: string): EncryptedBlob {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decryptBlob(blob: EncryptedBlob): string {
  const key = deriveKey();
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const data = Buffer.from(blob.data, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

function userFilePath(userId: string): string {
  const safeId = userId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(BYOK_DIR, `${safeId}.json`);
}

async function readPayload(userId: string): Promise<ByokFilePayload> {
  const filePath = userFilePath(userId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ByokFilePayload;
    if (parsed.version !== 1 || !parsed.providers) {
      return { version: 1, providers: {} };
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, providers: {} };
    }
    throw error;
  }
}

async function writePayload(userId: string, payload: ByokFilePayload): Promise<void> {
  await fs.mkdir(BYOK_DIR, { recursive: true });
  await fs.writeFile(userFilePath(userId), JSON.stringify(payload, null, 2), "utf8");
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export async function getByokApiKey(
  userId: string,
  provider: ByokProviderId,
): Promise<string | null> {
  if (!process.env.BYOK_ENCRYPTION_KEY?.trim()) {
    return null;
  }
  const payload = await readPayload(userId);
  const blob = payload.providers[provider];
  if (!blob) return null;
  try {
    return decryptBlob(blob).trim() || null;
  } catch {
    return null;
  }
}

export async function setByokApiKey(
  userId: string,
  provider: ByokProviderId,
  apiKey: string,
): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("La API key no puede estar vacía");
  }
  const payload = await readPayload(userId);
  payload.providers[provider] = encryptPlaintext(trimmed);
  await writePayload(userId, payload);
}

export async function deleteByokApiKey(
  userId: string,
  provider: ByokProviderId,
): Promise<void> {
  const payload = await readPayload(userId);
  delete payload.providers[provider];
  await writePayload(userId, payload);
}

export async function deleteAllByokKeys(userId: string): Promise<void> {
  try {
    await fs.unlink(userFilePath(userId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function listByokConfigured(
  userId: string,
): Promise<Partial<Record<ByokProviderId, { maskedKey: string }>>> {
  if (!process.env.BYOK_ENCRYPTION_KEY?.trim()) {
    return {};
  }
  const payload = await readPayload(userId);
  const result: Partial<Record<ByokProviderId, { maskedKey: string }>> = {};
  for (const meta of BYOK_PROVIDERS) {
    const blob = payload.providers[meta.id];
    if (!blob) continue;
    try {
      const key = decryptBlob(blob);
      result[meta.id] = { maskedKey: maskApiKey(key) };
    } catch {
      // clave corrupta: omitir
    }
  }
  return result;
}

export function isByokStorageEnabled(): boolean {
  return Boolean(process.env.BYOK_ENCRYPTION_KEY?.trim());
}