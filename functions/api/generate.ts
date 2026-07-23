import { verifyToken } from "../_shared/auth";
import { generateConfig } from "../_shared/generator";
import { json, readJson } from "../_shared/http";
import { getTemplate } from "../_shared/templates";
import type { Env, GenerateInput } from "../_shared/types";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await verifyToken(request, env))) return json({ error: "未登录" }, 401);
  try {
    const body = await readJson<GenerateInput>(request);
    const content = body.templateContent?.trim();
    const template = content ? { content } : body.templateId ? await getTemplate(env, body.templateId) : null;
    if (!template) return json({ error: "模板不存在或未输入模板内容" }, 404);
    return json({ content: generateConfig(template.content, body.nodeInput ?? body.uris ?? "", body.subscriptions || []) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "生成失败" }, 400);
  }
};
