import type { Env, Role } from "./types";

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(value: string) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  return atob(value);
}

async function sign(data: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))));
}

function secretOf(env: Env) {
  return env.TOKEN_SECRET || env.ADMIN_PASSWORD || env.ACCESS_PASSWORD || "clash-template-local";
}

export async function createToken(role: Role, env: Env) {
  const payload = b64url(encoder.encode(JSON.stringify({ role, exp: Date.now() + 7 * 24 * 3600_000 })));
  return `${payload}.${await sign(payload, secretOf(env))}`;
}

export async function verifyToken(request: Request, env: Env, role?: Role) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || (await sign(payload, secretOf(env))) !== signature) return null;
  try {
    const data = JSON.parse(fromB64url(payload)) as { role: Role; exp: number };
    if (data.exp < Date.now()) return null;
    if (role === "admin" && data.role !== "admin") return null;
    return data;
  } catch {
    return null;
  }
}

export function resolveRole(password: string, env: Env): Role | null {
  if (env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) return "admin";
  if (env.ACCESS_PASSWORD && password === env.ACCESS_PASSWORD) return "user";
  if (!env.ACCESS_PASSWORD && !env.ADMIN_PASSWORD && password === "admin") return "admin";
  return null;
}
