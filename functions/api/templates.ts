import { verifyToken } from "../_shared/auth";
import { json, readJson } from "../_shared/http";
import { deleteTemplate, getTemplate, listTemplates, persistenceMode, saveTemplate } from "../_shared/templates";
import type { Env } from "../_shared/types";

type SaveBody = { id?: string; name: string; content: string; builtin?: boolean };

function memoryWarning(env: Env) {
  return persistenceMode(env) === "memory"
    ? "当前未绑定 TEMPLATE_KV，保存仅在本进程内存中，重启后会丢失"
    : undefined;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await verifyToken(request, env))) return json({ error: "未登录" }, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const template = await getTemplate(env, id);
    if (!template) return json({ error: "模板不存在" }, 404);
    return json(template);
  }
  return json({ templates: await listTemplates(env), persistence: persistenceMode(env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await verifyToken(request, env, "admin"))) return json({ error: "需要管理员权限" }, 403);
  try {
    const body = await readJson<SaveBody>(request);
    if (!body.name?.trim() || !body.content?.trim()) return json({ error: "模板名称和内容不能为空" }, 400);
    const template = await saveTemplate(env, body);
    const warning = memoryWarning(env);
    return json({ template, persistence: persistenceMode(env), ...(warning ? { warning } : {}) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "保存失败" }, 400);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await verifyToken(request, env, "admin"))) return json({ error: "需要管理员权限" }, 403);
  const id = new URL(request.url).searchParams.get("id") || "";
  try {
    await deleteTemplate(env, id);
    return json({ ok: true, persistence: persistenceMode(env) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "删除失败" }, 400);
  }
};
