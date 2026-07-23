import { createToken, resolveRole } from "../_shared/auth";
import { json, readJson } from "../_shared/http";
import type { Env } from "../_shared/types";

type Body = { password?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await readJson<Body>(request);
    const role = resolveRole(body.password || "", env);
    if (!role) return json({ error: "密码错误" }, 401);
    return json({ token: await createToken(role, env), role });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "登录失败" }, 400);
  }
};
