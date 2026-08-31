const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { defaultTemplates } = require("./defaultTemplates.ts");
const { getTemplate, listTemplates, resetBuiltinTemplate, saveTemplate } = require("./templates.ts");

function createEnv() {
  const entries = new Map();
  return {
    entries,
    env: {
      TEMPLATE_KV: {
        get: async (key) => entries.get(key) || null,
        put: async (key, value) => entries.set(key, value),
        delete: async (key) => entries.delete(key),
      },
    },
  };
}

test("legacy built-in overrides migrate to custom templates without replacing deployed defaults", async () => {
  const { env, entries } = createEnv();
  const defaultWindows = defaultTemplates.find((item) => item.id === "windows");
  entries.set("templates:item:windows", JSON.stringify({
    id: "windows",
    name: "Windows",
    content: "legacy: true\n",
    builtin: true,
  }));

  const template = await getTemplate(env, "windows");
  const templates = await listTemplates(env);

  assert.equal(template.content, defaultWindows.content);
  assert.equal(templates.find((item) => item.id === "windows").hasLegacyOverride, false);
  assert.equal(templates.some((item) => item.name === "Windows（旧自定义）"), true);
  assert.equal(entries.has("templates:item:windows"), false);
});

test("matching legacy built-in overrides are removed without creating a custom template", async () => {
  const { env, entries } = createEnv();
  const defaultWindows = defaultTemplates.find((item) => item.id === "windows");
  entries.set("templates:item:windows", JSON.stringify({
    id: "windows",
    name: "Windows",
    content: defaultWindows.content.replace(/\n/g, "\r\n"),
    builtin: true,
  }));

  const templates = await listTemplates(env);

  assert.equal(entries.has("templates:item:windows"), false);
  assert.equal(templates.some((item) => item.name === "Windows（旧自定义）"), false);
});

test("saving a built-in template creates an independent custom copy", async () => {
  const { env } = createEnv();
  const defaultWindows = defaultTemplates.find((item) => item.id === "windows");

  const saved = await saveTemplate(env, {
    id: "windows",
    name: "Windows",
    content: "proxies: []\n",
    builtin: true,
  });
  const templates = await listTemplates(env);
  const builtin = await getTemplate(env, "windows");

  assert.notEqual(saved.id, "windows");
  assert.equal(saved.builtin, false);
  assert.equal(saved.name, "Windows（自定义）");
  assert.equal(templates.some((item) => item.id === saved.id && !item.builtin), true);
  assert.equal(builtin.content, defaultWindows.content);
});

test("reset removes a legacy built-in KV override", async () => {
  const { env, entries } = createEnv();
  entries.set("templates:item:linux-cn", JSON.stringify({ id: "linux-cn", name: "Linux 国内", content: "legacy", builtin: true }));

  await resetBuiltinTemplate(env, "linux-cn");

  assert.equal(entries.has("templates:item:linux-cn"), false);
  assert.equal((await listTemplates(env)).find((item) => item.id === "linux-cn").hasLegacyOverride, false);
});
