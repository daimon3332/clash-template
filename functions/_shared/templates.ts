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

async function newCustomId(env: Env, name: string) {
  const base = safeId(`${name}-custom`) || "custom-template";
  if (!defaultById(base) && !(await kvGet(env, templateKey(base)))) return base;
  return `${base.slice(0, 55)}-${crypto.randomUUID().slice(0, 8)}`;
}

function sameContent(left: string, right: string) {
  return left.replace(/\r\n/g, "\n") === right.replace(/\r\n/g, "\n");
}

async function migrateLegacyBuiltinOverride(env: Env, builtin: TemplateRecord) {
  const raw = await kvGet(env, templateKey(builtin.id));
  if (!raw) return false;
  try {
    const legacy = JSON.parse(raw) as TemplateRecord;
    if (sameContent(legacy.content, builtin.content)) {
      await kvDelete(env, templateKey(builtin.id));
      return false;
    }
    const id = await newCustomId(env, `${builtin.id}-legacy`);
    const record: TemplateRecord = {
      id,
      name: `${builtin.name}（旧自定义）`,
      content: legacy.content,
      builtin: false,
      updatedAt: legacy.updatedAt || now(),
    };
    await kvPut(env, templateKey(id), JSON.stringify(record));
    await saveCustomIds(env, [...(await customIds(env)), id]);
    await kvDelete(env, templateKey(builtin.id));
    return false;
  } catch {
    return true;
  }
}

export function persistenceMode(env: Env): "kv" | "memory" {
  return env.TEMPLATE_KV ? "kv" : "memory";
}

export async function listTemplates(env: Env) {
  const result: TemplateRecord[] = [];
  for (const item of defaultTemplates) {
    result.push({ ...item, hasLegacyOverride: await migrateLegacyBuiltinOverride(env, item) });
  }
  for (const id of await customIds(env)) {
    const raw = await kvGet(env, templateKey(id));
    if (raw) result.push(JSON.parse(raw));
  }
  return result.map(({ content: _content, ...meta }) => meta);
}

export async function getTemplate(env: Env, id: string) {
  const cleanId = safeId(id);
  const builtin = defaultById(cleanId);
  if (builtin) return builtin;
  const override = await kvGet(env, templateKey(cleanId));
  if (override) return JSON.parse(override) as TemplateRecord;
  return null;
}

export async function saveTemplate(env: Env, input: { id?: string; name: string; content: string; builtin?: boolean }) {
  const existingBuiltin = input.id ? defaultById(safeId(input.id)) : undefined;
  const builtin = input.builtin === true || Boolean(existingBuiltin);
  const id = builtin ? await newCustomId(env, input.name) : safeId(input.id || input.name || crypto.randomUUID());
  if (!id) throw new Error("Invalid template id");
  const record: TemplateRecord = {
    id,
    name: builtin && input.name.trim() === existingBuiltin?.name ? `${existingBuiltin.name}（自定义）` : input.name.trim() || id,
    content: input.content,
    builtin: false,
    updatedAt: now(),
  };
  await kvPut(env, templateKey(id), JSON.stringify(record));
  await saveCustomIds(env, [...(await customIds(env)), id]);
  return record;
}

export async function resetBuiltinTemplate(env: Env, id: string) {
  const cleanId = safeId(id);
  if (!defaultById(cleanId)) throw new Error("只能恢复默认模板");
  await kvDelete(env, templateKey(cleanId));
}

export async function deleteTemplate(env: Env, id: string) {
  const cleanId = safeId(id);
  if (defaultById(cleanId)) throw new Error("Builtin templates cannot be deleted");
  await kvDelete(env, templateKey(cleanId));
  await saveCustomIds(env, (await customIds(env)).filter((item) => item !== cleanId));
}
