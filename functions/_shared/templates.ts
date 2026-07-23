import { defaultTemplates } from "./defaultTemplates";
import type { Env, TemplateRecord } from "./types";

const customIndexKey = "templates:custom:index";
const templateKey = (id: string) => `templates:item:${id}`;
const safeId = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

const memory = new Map<string, string>();

function now() {
  return new Date().toISOString();
}

function defaultById(id: string) {
  return defaultTemplates.find((item) => item.id === id);
}

async function kvGet(env: Env, key: string) {
  if (env.TEMPLATE_KV) return env.TEMPLATE_KV.get(key);
  return memory.get(key) || null;
}

async function kvPut(env: Env, key: string, value: string) {
  if (env.TEMPLATE_KV) return env.TEMPLATE_KV.put(key, value);
  memory.set(key, value);
}

async function kvDelete(env: Env, key: string) {
  if (env.TEMPLATE_KV) return env.TEMPLATE_KV.delete(key);
  memory.delete(key);
}

async function customIds(env: Env) {
  const raw = await kvGet(env, customIndexKey);
  if (!raw) return [] as string[];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function saveCustomIds(env: Env, ids: string[]) {
  await kvPut(env, customIndexKey, JSON.stringify([...new Set(ids)]));
}

export function persistenceMode(env: Env): "kv" | "memory" {
  return env.TEMPLATE_KV ? "kv" : "memory";
}

export async function listTemplates(env: Env) {
  const result: TemplateRecord[] = [];
  for (const item of defaultTemplates) {
    const override = await kvGet(env, templateKey(item.id));
    result.push(override ? JSON.parse(override) : item);
  }
  for (const id of await customIds(env)) {
    const raw = await kvGet(env, templateKey(id));
    if (raw) result.push(JSON.parse(raw));
  }
  return result.map(({ content: _content, ...meta }) => meta);
}

export async function getTemplate(env: Env, id: string) {
  const cleanId = safeId(id);
  const override = await kvGet(env, templateKey(cleanId));
  if (override) return JSON.parse(override) as TemplateRecord;
  return defaultById(cleanId) || null;
}

export async function saveTemplate(env: Env, input: { id?: string; name: string; content: string; builtin?: boolean }) {
  const builtin = input.builtin === true || Boolean(input.id && defaultById(input.id));
  const id = builtin ? safeId(input.id || "") : safeId(input.id || input.name || crypto.randomUUID());
  if (!id) throw new Error("Invalid template id");
  const base = defaultById(id);
  const record: TemplateRecord = {
    id,
    name: input.name.trim() || base?.name || id,
    content: input.content,
    builtin: Boolean(base),
    updatedAt: now(),
  };
  await kvPut(env, templateKey(id), JSON.stringify(record));
  if (!record.builtin) await saveCustomIds(env, [...(await customIds(env)), id]);
  return record;
}

export async function deleteTemplate(env: Env, id: string) {
  const cleanId = safeId(id);
  if (defaultById(cleanId)) throw new Error("Builtin templates cannot be deleted");
  await kvDelete(env, templateKey(cleanId));
  await saveCustomIds(env, (await customIds(env)).filter((item) => item !== cleanId));
}
