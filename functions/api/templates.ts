import { verifyToken } from "../_shared/auth";
import { json, readJson } from "../_shared/http";
import { deleteTemplate, getTemplate, listTemplates, saveTemplate } from "../_shared/templates";
import type { Env } from "../_shared/types";

type SaveBody = { id?: string; name: string; content: string; builtin?: boolean };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await verifyToken(request, env))) return json({ error: "未登录" }, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const template = await getTemplate(env, id);
    if (!template) return json({ error: "模板不存在" }, 404);
    return json(template);
  }
  return json({ templates: await listTemplates(env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await verifyToken(request, env, "admin"))) return json({ error: "需要管理员权限" }, 403);
  try {
    const body = await readJson<SaveBody>(request);
    if (!body.name?.trim() || !body.content?.trim()) return json({ error: "模板名称和内容不能为空" }, 400);
    return json({ template: await saveTemplate(env, body) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "保存失败" }, 400);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await verifyToken(request, env, "admin"))) return json({ error: "需要管理员权限" }, 403);
  const id = new URL(request.url).searchParams.get("id") || "";
  try {
    await deleteTemplate(env, id);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "删除失败" }, 400);
  }
};
