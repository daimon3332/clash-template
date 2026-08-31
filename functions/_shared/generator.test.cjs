const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");
const { parse } = require("yaml");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { generateConfig } = require("./generator.ts");

function groups(output) {
  return parse(output)["proxy-groups"];
}

function subscription(prefix) {
  return { prefix, url: `https://example.com/${prefix}` };
}

test("inserts airport references after Hong Kong smart and groups before Microsoft", () => {
  const template = `proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
      - 香港智能筛选
      - 日本手动
  - name: Microsoft
    type: select
    proxies: [DIRECT]
rules:
  - MATCH,节点选择
`;
  const output = generateConfig(template, "", [subscription("Alpha"), subscription("Beta")]);
  const parsedGroups = groups(output);
  const nodeSelect = parsedGroups.find((group) => group.name === "节点选择");
  const names = parsedGroups.map((group) => group.name);

  assert.deepEqual(nodeSelect.proxies, ["DIRECT", "香港智能筛选", "🛫 Alpha", "🛫 Beta", "日本手动"]);
  assert.ok(names.indexOf("🛫 Alpha") < names.indexOf("Microsoft"));
  assert.ok(names.indexOf("🛫 Beta") < names.indexOf("Microsoft"));
});

test("appends to both lists when optional anchors are missing", () => {
  const template = `proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
  - name: Existing
    type: select
    proxies: [DIRECT]
rules:
  - MATCH,节点选择
`;
  const output = generateConfig(template, "", [subscription("Demo")]);
  const parsedGroups = groups(output);

  assert.deepEqual(parsedGroups[0].proxies, ["DIRECT", "🛫 Demo"]);
  assert.equal(parsedGroups.at(-1).name, "🛫 Demo");
});

test("updates inline proxies without creating a duplicate key", () => {
  const template = `proxy-groups:
  - name: 节点选择
    type: select
    proxies: [DIRECT, 香港智能筛选]
  - name: Microsoft
    type: select
    proxies: [DIRECT]
`;
  const output = generateConfig(template, "", [subscription("Demo")]);
  const parsedGroups = groups(output);

  assert.deepEqual(parsedGroups[0].proxies, ["DIRECT", "香港智能筛选", "🛫 Demo"]);
  assert.equal(Object.hasOwn(parsedGroups[0], "proxies"), true);
});

test("does not duplicate existing airport references or groups", () => {
  const template = `proxy-groups:
  - name: 节点选择
    type: select
    proxies: [DIRECT, 🛫 Demo]
  - name: 🛫 Demo
    type: select
    use: [Demo]
`;
  const output = generateConfig(template, "", [subscription("Demo")]);
  const parsedGroups = groups(output);

  assert.equal(parsedGroups[0].proxies.filter((name) => name === "🛫 Demo").length, 1);
  assert.equal(parsedGroups.filter((group) => group.name === "🛫 Demo").length, 1);
});
