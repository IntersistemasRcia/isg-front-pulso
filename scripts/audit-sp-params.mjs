/**
 * Audita GET /SPs_arquitectura (modo slim sys.parameters).
 * Uso:
 *   $env:PULSO_AUDIT_TOKEN="eyJ..."
 *   npx tsx scripts/audit-sp-params.mjs
 */
import { Agent, fetch as undiciFetch } from "undici";
import { normalizeArquitecturaPayload } from "../src/lib/pulso/normalizeArquitectura.ts";

const AUTH_URL = process.env.AUTH_API_URL || "http://api.intersistemas.ar:8601";
const PULSO_URL =
  process.env.PULSO_API_URL ||
  process.env.NEXT_PUBLIC_PULSO_API_URL ||
  "https://localhost:44351/api/v1/pulso";

async function getToken() {
  if (process.env.PULSO_AUDIT_TOKEN) return process.env.PULSO_AUDIT_TOKEN.trim();

  const user = process.env.PULSO_AUDIT_USER;
  const pass = process.env.PULSO_AUDIT_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Definí PULSO_AUDIT_TOKEN o PULSO_AUDIT_USER + PULSO_AUDIT_PASSWORD",
    );
  }

  const res = await fetch(`${AUTH_URL}/api/Auth/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: user, password: pass }),
  });
  const data = await res.json();
  const token = data.token || data.Token;
  if (!token) throw new Error(`Login falló: ${JSON.stringify(data)}`);
  return token;
}

async function main() {
  const token = await getToken();
  const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

  const res = await undiciFetch(`${PULSO_URL}/SPs_arquitectura`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    dispatcher,
  });

  if (!res.ok) {
    throw new Error(`SPs_arquitectura HTTP ${res.status}: ${await res.text()}`);
  }

  const raw = await res.json();
  const catalog = normalizeArquitecturaPayload(raw);

  console.log(`\nSPs slim (sys.parameters): ${catalog.length}\n`);

  let buscar = null;
  for (const sp of catalog) {
    const params = (sp.parametros ?? [])
      .map((p) => `${p.nombre}:${p.tipo ?? "?"}${p.requerido === false ? "?" : ""}`)
      .join(", ");
    console.log(`${sp.nombre}\n  → [${params || "(sin params de entrada)"}]\n`);
    if (/BuscarClientes/i.test(sp.nombre)) buscar = sp;
  }

  console.log("——— Checks ———");
  if (buscar) {
    const names = (buscar.parametros ?? []).map((p) => p.nombre);
    const hasLike = names.some((n) => /liketerm/i.test(n));
    console.log(
      `BuscarClientes params: [${names.join(", ")}]`,
      hasLike ? "FAIL: LikeTerm no debería aparecer" : "OK (sin LikeTerm)",
    );
  } else {
    console.log("BuscarClientes no está en el catálogo (¿SP sin params en sys.parameters?).");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
