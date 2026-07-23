import { useEffect, useMemo, useState } from "react";
import type { Role, SubscriptionInput, TemplateMeta, TemplateRecord } from "./lib/types";
import { rewriteUriInput, uriInputToYaml, yamlInputToUri } from "./lib/nodeConverter";

const tokenKey = "clash-template-token";
const roleKey = "clash-template-role";

type Page = "generate" | "templates" | "converter" | "rewriter";
type TemplateMode = "saved" | "custom";

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(data.error || "请求失败", response.status);
  return data as T;
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name || "clash"}.yaml`;
  link.click();
  URL.revokeObjectURL(url);
}

function emptySub(): SubscriptionInput {
  return { prefix: "", url: "" };
}

function readFile(file: File, callback: (content: string) => void) {
  const reader = new FileReader();
  reader.onload = () => callback(String(reader.result || ""));
  reader.readAsText(file);
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || "");
  const [role, setRole] = useState<Role>((localStorage.getItem(roleKey) as Role) || "user");
  const [page, setPage] = useState<Page>("generate");
  const [password, setPassword] = useState("");
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateId, setTemplateId] = useState("windows");
  const [templateMode, setTemplateMode] = useState<TemplateMode>("saved");
  const [customTemplate, setCustomTemplate] = useState("");
  const [nodeInput, setNodeInput] = useState("");
  const [subscriptions, setSubscriptions] = useState<SubscriptionInput[]>([emptySub()]);
  const [output, setOutput] = useState("");
  const [converterInput, setConverterInput] = useState("");
  const [converterOutput, setConverterOutput] = useState("");
  const [converterWrap, setConverterWrap] = useState(false);
  const [rewriteInput, setRewriteInput] = useState("");
  const [rewriteAddress, setRewriteAddress] = useState("");
  const [rewriteRemark, setRewriteRemark] = useState("");
  const [rewriteOutput, setRewriteOutput] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [editingName, setEditingName] = useState("");

  const currentTemplate = useMemo(() => templates.find((item) => item.id === templateId), [templateId, templates]);

  function clearAuth(message = "登录已过期，请重新登录") {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(roleKey);
    setToken("");
    setRole("user");
    setTemplates([]);
    setMessage(message);
  }

  function handleError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) {
      clearAuth();
      return;
    }
    setMessage(error instanceof Error ? error.message : fallback);
  }

  async function loadTemplates() {
    const data = await api<{ templates: TemplateMeta[] }>("/api/templates");
    setTemplates(data.templates);
    if (!data.templates.some((item) => item.id === templateId) && data.templates[0]) setTemplateId(data.templates[0].id);
  }

  useEffect(() => {
    if (token) loadTemplates().catch((error) => handleError(error, "读取模板失败"));
  }, [token]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await api<{ token: string; role: Role }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      localStorage.setItem(tokenKey, data.token);
      localStorage.setItem(roleKey, data.role);
      setToken(data.token);
      setRole(data.role);
      setMessage("登录成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    }
  }

  async function generate() {
    try {
      const cleanSubs = subscriptions.filter((item) => item.prefix.trim() && item.url.trim());
      const data = await api<{ content: string }>("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          templateId: templateMode === "saved" ? templateId : undefined,
          templateContent: templateMode === "custom" ? customTemplate : undefined,
          nodeInput,
          subscriptions: cleanSubs,
        }),
      });
      setOutput(data.content);
      setMessage("配置已生成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    }
  }

  async function openEditor(id: string) {
    try {
      const data = await api<TemplateRecord>(`/api/templates?id=${encodeURIComponent(id)}`);
      setEditing(data);
      setEditingName(data.name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取模板失败");
    }
  }

  function openNewTemplate(content = "proxies: []\nproxy-providers: {}\nproxy-groups: []\nrules: []\n", name = "自定义模板") {
    setEditing({ id: "", name, builtin: false, content });
    setEditingName(name);
  }

  async function saveEditing() {
    if (!editing) return;
    try {
      const data = await api<{ template: TemplateRecord }>("/api/templates", {
        method: "POST",
        body: JSON.stringify({ id: editing.id || undefined, name: editingName, content: editing.content, builtin: editing.builtin }),
      });
      setEditing(data.template);
      setEditingName(data.template.name);
      setTemplateId(data.template.id);
      setMessage("模板已保存");
      await loadTemplates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function removeTemplate(id: string) {
    if (!confirm("确认删除这个自定义模板？")) return;
    try {
      await api(`/api/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setEditing(null);
      setMessage("模板已删除");
      await loadTemplates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  function updateSub(index: number, value: Partial<SubscriptionInput>) {
    setSubscriptions((items) => items.map((item, i) => i === index ? { ...item, ...value } : item));
  }

  function removeSub(index: number) {
    setSubscriptions((items) => items.length === 1 ? [emptySub()] : items.filter((_, i) => i !== index));
  }

  function convertUriToYaml() {
    try {
      setConverterOutput(uriInputToYaml(converterInput, converterWrap));
      setMessage("URI 已转换为 YAML");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "转换失败");
    }
  }

  function convertYamlToUri() {
    try {
      setConverterOutput(yamlInputToUri(converterInput));
      setMessage("YAML 已转换为 URI");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "转换失败");
    }
  }

  async function copyConverterOutput() {
    if (!converterOutput) return;
    await navigator.clipboard.writeText(converterOutput);
    setMessage("已复制转换结果");
  }

  function rewriteNodes() {
    try {
      setRewriteOutput(rewriteUriInput(rewriteInput, rewriteAddress, rewriteRemark));
      setMessage("节点已改写");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "改写失败");
    }
  }

  async function copyRewriteOutput() {
    if (!rewriteOutput) return;
    await navigator.clipboard.writeText(rewriteOutput);
    setMessage("已复制改写结果");
  }

  if (!token) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={login}>
          <div className="brand-mark">Clash Template</div>
          <h1>模板配置生成</h1>
          <p>输入访问密码进入。管理员密码可管理模板。</p>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="访问密码" autoFocus />
          <button>登录</button>
          {message && <div className="toast">{message}</div>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-tab" onClick={() => setPage("generate")}>Clash Template</button>
        <nav className="nav-tabs">
          <button className={page === "generate" ? "active" : ""} onClick={() => setPage("generate")}>模板配置生成</button>
          <button className={page === "converter" ? "active" : ""} onClick={() => setPage("converter")}>转换工具</button>
          <button className={page === "rewriter" ? "active" : ""} onClick={() => setPage("rewriter")}>节点改写</button>
          {role === "admin" && <button className={page === "templates" ? "active" : ""} onClick={() => setPage("templates")}>模板管理</button>}
        </nav>
      </header>

      {message && <div className="toast">{message}</div>}

      {page === "generate" ? (
        <section className="workspace">
          <section className="input-pane">
            <section className="step-card accent-card">
              <div className="step-head">
                <span>01</span>
                <div>
                  <h2>模板来源</h2>
                  <p>选择默认/自定义模板，或直接粘贴完整 YAML。</p>
                </div>
              </div>
              <div className="segmented">
                <button className={templateMode === "saved" ? "active" : ""} onClick={() => setTemplateMode("saved")}>已有模板</button>
                <button className={templateMode === "custom" ? "active" : ""} onClick={() => setTemplateMode("custom")}>直接输入</button>
              </div>
              {templateMode === "saved" ? (
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  {templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.builtin ? "（默认）" : ""}</option>)}
                </select>
              ) : (
                <>
                  <div className="mini-actions">
                    <label className="file-button">上传 YAML<input type="file" accept=".yaml,.yml,text/yaml" onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0], setCustomTemplate)} /></label>
                    <button className="soft" onClick={() => setCustomTemplate("")}>清空</button>
                  </div>
                  <textarea className="template-input" value={customTemplate} onChange={(event) => setCustomTemplate(event.target.value)} placeholder="粘贴完整 Clash/Mihomo YAML 模板" />
                </>
              )}
            </section>

            <section className="step-card">
              <div className="step-head">
                <span>02</span>
                <div>
                  <h2>静态节点</h2>
                  <p>支持 URI 多行、proxies YAML 段，或直接 YAML 节点列表。</p>
                </div>
              </div>
              <textarea className="node-input" value={nodeInput} onChange={(event) => setNodeInput(event.target.value)} placeholder="vless://...&#10;trojan://...&#10;&#10;或：&#10;proxies:&#10;  - name: ..." />
            </section>

            <section className="step-card">
              <div className="step-head">
                <span>03</span>
                <div>
                  <h2>机场订阅</h2>
                  <p>可添加多条订阅，前缀会同步写入 provider 与策略组。</p>
                </div>
              </div>
              <div className="subs-list">
                {subscriptions.map((item, index) => (
                  <div className="sub-card" key={index}>
                    <input value={item.prefix} onChange={(event) => updateSub(index, { prefix: event.target.value })} placeholder="前缀 / 机场名" />
                    <input value={item.url} onChange={(event) => updateSub(index, { url: event.target.value })} placeholder="订阅链接" />
                    <button className="icon-danger" onClick={() => removeSub(index)}>删除</button>
                  </div>
                ))}
              </div>
              <button className="soft full" onClick={() => setSubscriptions((items) => [...items, emptySub()])}>添加订阅</button>
            </section>

            <section className="action-card">
              <button className="primary" onClick={generate}>生成配置</button>
              <button className="secondary" disabled={!output} onClick={() => download(templateMode === "saved" ? currentTemplate?.name || "clash" : "custom-clash", output)}>下载 YAML</button>
            </section>
          </section>

          <section className="preview-pane">
            <div className="preview-head">
              <div>
                <h2>输出预览</h2>
                <p>生成后的 YAML 可继续微调，再下载保存。</p>
              </div>
              <span>{output ? `${output.length} chars` : "等待生成"}</span>
            </div>
            <textarea value={output} onChange={(event) => setOutput(event.target.value)} placeholder="生成后的配置会显示在这里" />
          </section>
        </section>
      ) : page === "converter" ? (
        <section className="converter-page">
          <div className="page-intro">
            <div>
              <h2>单行 URI ↔ YAML 节点</h2>
              <p>支持 ss、ssr、vmess、vless、trojan、hysteria、hysteria2/hy2、tuic、socks5、http 等常见协议。</p>
            </div>
            <div className="mini-actions">
              <button onClick={convertUriToYaml}>URI → YAML</button>
              <button className="secondary" onClick={convertYamlToUri}>YAML → URI</button>
              <label className="check-pill"><input type="checkbox" checked={converterWrap} onChange={(event) => setConverterWrap(event.target.checked)} />带 proxies</label>
              <button className="soft" onClick={copyConverterOutput} disabled={!converterOutput}>复制结果</button>
              <button className="soft" onClick={() => { setConverterInput(""); setConverterOutput(""); }}>清空</button>
            </div>
          </div>
          <div className="converter-grid">
            <section className="converter-card">
              <div className="preview-head">
                <div>
                  <h2>输入</h2>
                  <p>每行一个 URI，或粘贴 Clash/Mihomo YAML 节点。</p>
                </div>
                <label className="file-button">上传 YAML<input type="file" accept=".yaml,.yml,text/yaml,text/plain" onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0], setConverterInput)} /></label>
              </div>
              <textarea value={converterInput} onChange={(event) => setConverterInput(event.target.value)} placeholder={"vless://...\n\n或：\nproxies:\n  - name: ...\n    type: vless"} />
            </section>
            <section className="converter-card">
              <div className="preview-head">
                <div>
                  <h2>输出</h2>
                  <p>转换结果可直接复制。</p>
                </div>
                <span>{converterOutput ? `${converterOutput.length} chars` : "等待转换"}</span>
              </div>
              <textarea value={converterOutput} onChange={(event) => setConverterOutput(event.target.value)} placeholder="转换结果会显示在这里" />
            </section>
          </div>
        </section>
      ) : page === "rewriter" ? (
        <section className="converter-page">
          <div className="page-intro">
            <div>
              <h2>节点地址与备注改写</h2>
              <p>批量替换 URI 节点地址，并按序号生成新备注。</p>
            </div>
            <div className="mini-actions">
              <button onClick={rewriteNodes}>生成改写节点</button>
              <button className="soft" onClick={copyRewriteOutput} disabled={!rewriteOutput}>复制结果</button>
              <button className="soft" onClick={() => { setRewriteInput(""); setRewriteAddress(""); setRewriteRemark(""); setRewriteOutput(""); }}>清空</button>
            </div>
          </div>
          <div className="converter-grid">
            <section className="converter-card rewrite-card">
              <div className="preview-head">
                <div>
                  <h2>输入</h2>
                  <p>每行一个 URI 节点。</p>
                </div>
              </div>
              <div className="rewrite-fields">
                <label>
                  <span>新地址 / IP</span>
                  <input value={rewriteAddress} onChange={(event) => setRewriteAddress(event.target.value)} placeholder="86.32.65.21 或 example.com" />
                </label>
                <label>
                  <span>备注前缀</span>
                  <input value={rewriteRemark} onChange={(event) => setRewriteRemark(event.target.value)} placeholder="默认：加速节点" />
                </label>
              </div>
              <textarea value={rewriteInput} onChange={(event) => setRewriteInput(event.target.value)} placeholder={"vless://...#vl-reality-ubuntu\ntuic://...#tu5-ubuntu"} />
            </section>
            <section className="converter-card">
              <div className="preview-head">
                <div>
                  <h2>输出</h2>
                  <p>改写结果可直接复制。</p>
                </div>
                <span>{rewriteOutput ? `${rewriteOutput.length} chars` : "等待改写"}</span>
              </div>
              <textarea value={rewriteOutput} onChange={(event) => setRewriteOutput(event.target.value)} placeholder="改写后的节点会显示在这里" />
            </section>
          </div>
        </section>
      ) : (
        <section className="template-page">
          <div className="page-intro">
            <div>
              <h2>模板库</h2>
              <p>默认模板可以修改但不能删除；自定义模板可以修改和删除。</p>
            </div>
            <div className="mini-actions">
              <button onClick={() => openNewTemplate()}>新建模板</button>
              <label className="file-button">上传模板<input type="file" accept=".yaml,.yml,text/yaml" onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0], (content) => openNewTemplate(content, event.target.files![0].name.replace(/\.ya?ml$/i, "")))} /></label>
            </div>
          </div>
          <div className="template-grid">
            {templates.map((item) => (
              <button className="template-tile" key={item.id} onClick={() => openEditor(item.id)}>
                <span>{item.name}</span>
                <small>{item.builtin ? "默认模板" : "自定义模板"}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <section className="template-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <h2>{editing.id ? "编辑模板" : "新建模板"}</h2>
                <p>{editing.builtin ? "默认模板可修改，不可删除。" : "自定义模板可修改和删除。"}</p>
              </div>
              <button className="soft" onClick={() => setEditing(null)}>关闭</button>
            </header>
            <input className="modal-name" value={editingName} onChange={(event) => setEditingName(event.target.value)} placeholder="模板名称" />
            <textarea className="modal-editor" value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} />
            <footer className="modal-actions">
              <button className="primary" onClick={saveEditing}>保存模板</button>
              {!editing.builtin && editing.id && <button className="danger" onClick={() => removeTemplate(editing.id)}>删除模板</button>}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
