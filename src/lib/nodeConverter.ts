import { parse as parseYaml } from "yaml";

type ProxyNode = Record<string, unknown>;

type UriParser = (url: URL, original: string) => ProxyNode;

const basicOrder = ["name", "type", "server", "port", "username", "password", "udp", "tls", "skip-cert-verify"];
const orders: Record<string, string[]> = {
  ss: ["name", "type", "server", "port", "cipher", "password", "udp", "plugin", "plugin-opts"],
  ssr: ["name", "type", "server", "port", "cipher", "password", "protocol", "protocol-param", "obfs", "obfs-param", "udp"],
  vmess: ["name", "type", "server", "port", "uuid", "alterId", "cipher", "udp", "tls", "servername", "network", "ws-opts", "grpc-opts", "skip-cert-verify"],
  vless: ["name", "type", "server", "port", "uuid", "tls", "client-fingerprint", "servername", "network", "udp", "reality-opts", "ws-opts", "grpc-opts", "alpn", "flow", "packet-encoding", "encryption", "skip-cert-verify"],
  trojan: ["name", "type", "server", "port", "password", "sni", "udp", "network", "ws-opts", "skip-cert-verify"],
  hysteria: ["name", "type", "server", "port", "ports", "auth-str", "auth", "protocol", "up", "down", "sni", "alpn", "obfs", "obfs-password", "skip-cert-verify"],
  hysteria2: ["name", "type", "server", "port", "ports", "password", "sni", "alpn", "obfs", "obfs-password", "skip-cert-verify"],
  tuic: ["name", "type", "server", "port", "token", "uuid", "password", "sni", "alpn", "udp-relay-mode", "congestion-controller", "skip-cert-verify"],
  socks5: ["name", "type", "server", "port", "username", "password", "tls", "udp", "skip-cert-verify"],
  http: ["name", "type", "server", "port", "username", "password", "tls", "skip-cert-verify"],
  snell: ["name", "type", "server", "port", "psk", "version", "obfs-opts", "udp"],
  anytls: ["name", "type", "server", "port", "password", "sni", "alpn", "skip-cert-verify"],
  ssh: ["name", "type", "server", "port", "username", "password", "private-key", "private-key-passphrase"],
  wireguard: ["name", "type", "server", "port", "ip", "ipv6", "private-key", "public-key", "pre-shared-key", "dns", "udp"],
};

function decode(value = "") {
  try { return decodeURIComponent(value.replace(/\+/g, "%20")); } catch { return value; }
}

function decodeFragment(value = "") {
  try { return decodeURIComponent(value); } catch { return value; }
}

function enc(value: unknown) {
  return encodeURIComponent(String(value ?? ""));
}

function b64decode(value: string) {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function b64(value: string, urlsafe = false) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  const out = btoa(binary);
  return urlsafe ? out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") : out;
}

function nameOf(url: URL, scheme: string) {
  return decode(url.hash ? url.hash.slice(1) : `${scheme}-${url.hostname}-${url.port || defaultPort(scheme)}`);
}

function defaultPort(type: string) {
  if (["https", "trojan", "hysteria", "hysteria2", "hy2", "tuic", "vless", "vmess"].includes(type)) return "443";
  if (["http"].includes(type)) return "80";
  if (["ss", "ssr"].includes(type)) return "8388";
  if (["socks", "socks5"].includes(type)) return "1080";
  if (["ssh"].includes(type)) return "22";
  return "443";
}

function port(url: URL, scheme: string) {
  return Number(url.port || defaultPort(scheme));
}

function flag(params: URLSearchParams, names: string[]) {
  return names.some((name) => {
    const value = params.get(name);
    return value === "1" || value?.toLowerCase() === "true";
  });
}

function getAny(params: URLSearchParams, names: string[]) {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value !== "") return value;
  }
  return "";
}

function common(url: URL, scheme: string) {
  return { name: nameOf(url, scheme), server: url.hostname, port: port(url, scheme) };
}

function parseVless(url: URL): ProxyNode {
  const p = url.searchParams;
  const network = p.get("type") || p.get("net") || "tcp";
  const security = p.get("security") || (p.has("pbk") ? "reality" : p.has("sni") ? "tls" : "none");
  const node: ProxyNode = {
    ...common(url, "vless"), type: "vless", uuid: decode(url.username), tls: security !== "none",
    "client-fingerprint": p.get("fp") || p.get("fingerprint") || "chrome",
    servername: p.get("sni") || p.get("peer") || url.hostname,
    network, udp: true,
  };
  if (security === "reality" || p.has("pbk") || p.has("sid")) {
    node["reality-opts"] = { "public-key": p.get("pbk") || "", "short-id": p.get("sid") || "" };
    if (p.get("spx")) (node["reality-opts"] as Record<string, unknown>)["spider-x"] = p.get("spx");
  }
  if (network === "ws" || network === "httpupgrade") node["ws-opts"] = { path: p.get("path") || "/", headers: { Host: p.get("host") || p.get("authority") || p.get("sni") || url.hostname } };
  if (network === "grpc") node["grpc-opts"] = { "grpc-service-name": p.get("serviceName") || p.get("path") || "" };
  if (p.get("alpn")) node.alpn = p.get("alpn")!.split(",").filter(Boolean);
  if (p.get("flow")) node.flow = p.get("flow");
  if (p.get("encryption") && p.get("encryption") !== "none") node.encryption = p.get("encryption");
  if (p.get("packetEncoding")) node["packet-encoding"] = p.get("packetEncoding");
  node["skip-cert-verify"] = flag(p, ["insecure", "allowInsecure"]);
  return node;
}

function parseVmess(url: URL, original: string): ProxyNode {
  if (!original.includes("@")) {
    const data = JSON.parse(b64decode(original.slice("vmess://".length).split("#")[0]));
    const net = data.net || data.type || "tcp";
    const node: ProxyNode = {
      name: data.ps || data.name || `vmess-${data.add}-${data.port}`,
      type: "vmess", server: data.add, port: Number(data.port || 443), uuid: data.id,
      alterId: Number(data.aid || 0), cipher: data.scy || data.security || "auto", udp: true,
      tls: Boolean(data.tls && data.tls !== "none"), servername: data.sni || data.host || data.add, network: net,
    };
    if (net === "ws") node["ws-opts"] = { path: data.path || "/", headers: { Host: data.host || data.sni || data.add } };
    if (net === "grpc") node["grpc-opts"] = { "grpc-service-name": data.path || data.serviceName || "" };
    return node;
  }
  const p = url.searchParams;
  const node: ProxyNode = { ...common(url, "vmess"), type: "vmess", uuid: decode(url.username), alterId: Number(p.get("aid") || p.get("alterId") || 0), cipher: p.get("scy") || p.get("security") || "auto", udp: true, tls: (p.get("security") || p.get("tls")) === "tls", servername: p.get("sni") || p.get("host") || url.hostname, network: p.get("type") || p.get("net") || "tcp" };
  if (node.network === "ws") node["ws-opts"] = { path: p.get("path") || "/", headers: { Host: p.get("host") || url.hostname } };
  return node;
}

function parseTrojan(url: URL): ProxyNode {
  const p = url.searchParams;
  const network = p.get("type") || p.get("network") || "tcp";
  const node: ProxyNode = { ...common(url, "trojan"), type: "trojan", password: decode(url.username), sni: p.get("sni") || p.get("peer") || url.hostname, udp: true, network, "skip-cert-verify": flag(p, ["insecure", "allowInsecure"]) };
  if (network === "ws") node["ws-opts"] = { path: p.get("path") || "/", headers: { Host: p.get("host") || url.hostname } };
  return node;
}

function parseHysteria(url: URL): ProxyNode {
  const p = url.searchParams;
  return { ...common(url, "hysteria"), type: "hysteria", "auth-str": decode(url.username || p.get("auth") || p.get("auth-str") || ""), protocol: p.get("protocol") || "udp", up: p.get("upmbps") || p.get("up"), down: p.get("downmbps") || p.get("down"), sni: p.get("sni") || p.get("peer") || url.hostname, alpn: p.get("alpn")?.split(",").filter(Boolean), obfs: p.get("obfs"), "obfs-password": p.get("obfs-password") || p.get("obfsParam"), "skip-cert-verify": flag(p, ["insecure", "allowInsecure"]) };
}

function parseHysteria2(url: URL): ProxyNode {
  const p = url.searchParams;
  return { ...common(url, "hysteria2"), type: "hysteria2", password: decode(url.username || p.get("password") || p.get("auth") || p.get("uuid") || ""), sni: p.get("sni") || url.hostname, alpn: (p.get("alpn") || "h3").split(",").filter(Boolean), obfs: p.get("obfs"), "obfs-password": p.get("obfs-password"), "skip-cert-verify": p.get("insecure") === "1" };
}

function parseTuic(url: URL): ProxyNode {
  const p = url.searchParams;
  let uuid = decode(url.username);
  let password = decode(url.password);
  if (url.username.includes(":")) [uuid, password] = decode(url.username).split(":");
  const node: ProxyNode = { ...common(url, "tuic"), type: "tuic", uuid, password, token: p.get("token") || undefined, sni: p.get("sni") || url.hostname, alpn: (p.get("alpn") || "h3").split(",").filter(Boolean), "udp-relay-mode": p.get("udp_relay_mode") || p.get("udp-relay-mode") || "native", "congestion-controller": p.get("congestion_control") || p.get("congestion-controller") || "bbr", "skip-cert-verify": flag(p, ["allow_insecure", "insecure", "allowInsecure"]) };
  return node;
}

function parseSs(url: URL): ProxyNode {
  const p = url.searchParams;
  let cipher = "";
  let password = "";
  let server = url.hostname;
  let serverPort = port(url, "ss");
  if (url.username && url.password) {
    cipher = decode(url.username); password = decode(url.password);
  } else if (url.username) {
    const decoded = b64decode(decode(url.username));
    const index = decoded.indexOf(":"); cipher = decoded.slice(0, index); password = decoded.slice(index + 1);
  } else {
    const raw = decode(url.href.slice("ss://".length).split("#")[0].split("?")[0]);
    const decoded = b64decode(raw);
    const at = decoded.lastIndexOf("@"); const colon = decoded.lastIndexOf(":"); const auth = decoded.slice(0, at); const split = auth.indexOf(":");
    cipher = auth.slice(0, split); password = auth.slice(split + 1); server = decoded.slice(at + 1, colon); serverPort = Number(decoded.slice(colon + 1));
  }
  const node: ProxyNode = { name: nameOf(url, "ss"), type: "ss", server, port: serverPort, cipher, password, udp: true };
  const plugin = p.get("plugin");
  if (plugin) {
    const parts = decode(plugin).split(";").filter(Boolean); const [pluginName, ...pairs] = parts;
    node.plugin = pluginName.replace(/-local$/, "");
    const opts: Record<string, string> = {};
    pairs.forEach((pair) => { const [key, value = ""] = pair.split("="); if (key === "obfs") opts.mode = value; if (key === "obfs-host" || key === "host") opts.host = value; });
    if (Object.keys(opts).length) node["plugin-opts"] = opts;
  }
  return node;
}

function parseSsr(_: URL, original: string): ProxyNode {
  const text = b64decode(original.slice("ssr://".length));
  const [main, queryText = ""] = text.split("/?");
  const [server, portValue, protocol, cipher, obfs, pass64] = main.split(":");
  const q = new URLSearchParams(queryText);
  return { name: decode(b64decode(q.get("remarks") || "")) || `ssr-${server}-${portValue}`, type: "ssr", server, port: Number(portValue), cipher, password: b64decode(pass64 || ""), protocol, "protocol-param": q.get("protoparam") ? b64decode(q.get("protoparam")!) : "", obfs, "obfs-param": q.get("obfsparam") ? b64decode(q.get("obfsparam")!) : "", udp: true };
}

function parseHttpSocks(url: URL): ProxyNode {
  const scheme = url.protocol.replace(":", "");
  const type = scheme === "https" ? "http" : scheme === "socks" ? "socks5" : scheme;
  return { ...common(url, scheme), type, username: decode(url.username), password: decode(url.password), tls: scheme === "https", udp: type.startsWith("socks"), "skip-cert-verify": flag(url.searchParams, ["insecure", "allowInsecure"]) };
}

function parseSnell(url: URL): ProxyNode {
  const p = url.searchParams;
  const node: ProxyNode = { ...common(url, "snell"), type: "snell", psk: decode(url.username || p.get("psk") || ""), version: Number(p.get("version") || 3), udp: true };
  if (p.get("obfs")) node["obfs-opts"] = { mode: p.get("obfs"), host: p.get("obfs-host") || p.get("host") || "" };
  return node;
}

function parseGeneric(type: string): UriParser {
  return (url) => ({ ...common(url, type), type, username: decode(url.username), password: decode(url.password), sni: getAny(url.searchParams, ["sni", "peer", "servername"]), "skip-cert-verify": flag(url.searchParams, ["insecure", "allowInsecure", "allow_insecure"]) });
}

const parsers: Record<string, UriParser> = {
  vless: (url) => parseVless(url), vmess: parseVmess, trojan: (url) => parseTrojan(url), hysteria: (url) => parseHysteria(url), hysteria2: (url) => parseHysteria2(url), hy2: (url) => parseHysteria2(url), tuic: (url) => parseTuic(url), ss: (url) => parseSs(url), ssr: parseSsr, http: (url) => parseHttpSocks(url), https: (url) => parseHttpSocks(url), socks: (url) => parseHttpSocks(url), socks5: (url) => parseHttpSocks(url), snell: (url) => parseSnell(url), anytls: parseGeneric("anytls"), ssh: parseGeneric("ssh"), mieru: parseGeneric("mieru"), wireguard: parseGeneric("wireguard"), wg: parseGeneric("wireguard"),
};

export function uriToNode(uri: string): ProxyNode {
  const original = uri.trim();
  const scheme = original.slice(0, original.indexOf("://")).toLowerCase();
  const parser = parsers[scheme];
  if (!parser) throw new Error(`不支持的协议：${scheme || "空"}`);
  const url = new URL(original);
  return cleanNode(parser(url, original));
}

function cleanNode(node: ProxyNode): ProxyNode {
  return Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0)));
}

function scalar(value: unknown) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = String(value ?? "");
  if (/^[\w.@:/%+\-[\]\u4e00-\u9fa5]+$/.test(text) && text !== "") return text;
  return JSON.stringify(text);
}

function emitKey(lines: string[], key: string, value: unknown, prefix: string, child: string, grand: string) {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return;
  if (Array.isArray(value)) {
    lines.push(`${prefix}${key}:`);
    value.forEach((item) => lines.push(`${grand}- ${scalar(item)}`));
  } else if (typeof value === "object") {
    lines.push(`${prefix}${key}:`);
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => emitKey(lines, childKey, childValue, grand, grand + "  ", grand + "    "));
  } else {
    lines.push(`${prefix}${key}: ${scalar(value)}`);
  }
}

export function nodeToYaml(node: ProxyNode, indent = 0) {
  const type = String(node.type || "").toLowerCase();
  const keys = [...(orders[type] || basicOrder), ...Object.keys(node).filter((key) => !(orders[type] || basicOrder).includes(key))];
  const lines: string[] = [];
  keys.forEach((key, index) => emitKey(lines, key, node[key], index === 0 ? `${" ".repeat(indent)}- ` : " ".repeat(indent + 2), " ".repeat(indent + 2), " ".repeat(indent + 4)));
  return lines.join("\n");
}

function dedent(input: string) {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)?.[0].length || 0);
  const base = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(Math.min(base, line.length))).join("\n").trim();
}

function stripFence(input: string) {
  const text = input.replace(/\r\n/g, "\n");
  const fenced = text.trim().match(/^```(?:yaml|yml)?\s*([\s\S]*?)\s*```$/i);
  return dedent(fenced ? fenced[1] : text);
}

export function yamlToNodes(input: string) {
  const data = parseYaml(stripFence(input));
  const raw: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.proxies) ? data.proxies : data && typeof data === "object" && data.type ? [data] : [];
  const nodes = raw.map((item: unknown) => cleanNode(item as ProxyNode)).filter((node: ProxyNode) => node.name || node.type || node.server);
  if (!nodes.length) throw new Error("未识别到 YAML 节点");
  return nodes;
}

export function uriInputToYaml(input: string, wrapProxies = false) {
  const nodes = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(uriToNode);
  if (!nodes.length) throw new Error("请输入 URI");
  const body = nodes.map((node) => nodeToYaml(node, wrapProxies ? 2 : 0)).join("\n");
  return wrapProxies ? `proxies:\n${body}` : body;
}

function q(params: Record<string, unknown>) {
  return Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && !value.length)).map(([key, value]) => `${key}=${enc(Array.isArray(value) ? value.join(",") : value)}`).join("&");
}

function bool(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function hostOf(node: ProxyNode) { return `${node.server}:${node.port || defaultPort(String(node.type || ""))}`; }
function nodeName(node: ProxyNode) { return `#${enc(node.name || `${node.type}-${node.server}-${node.port}`)}`; }
function nested(node: ProxyNode, key: string) { return (node[key] || {}) as Record<string, unknown>; }
function wsHost(node: ProxyNode) { return nested(nested(node, "ws-opts"), "headers").Host || nested(nested(node, "ws-opts"), "headers").host; }
function wsPath(node: ProxyNode) { return nested(node, "ws-opts").path; }
function grpcName(node: ProxyNode) { return nested(node, "grpc-opts")["grpc-service-name"] || nested(node, "grpc-opts").serviceName; }

function yamlNodeToVless(node: ProxyNode) {
  const reality = nested(node, "reality-opts");
  const network = node.network || (node["ws-opts"] ? "ws" : node["grpc-opts"] ? "grpc" : "tcp");
  const query = q({ encryption: node.encryption || "none", flow: node.flow, security: reality["public-key"] ? "reality" : bool(node.tls) ? "tls" : "none", sni: node.servername || node.sni, fp: node["client-fingerprint"] || node.fingerprint || "chrome", pbk: reality["public-key"], sid: reality["short-id"], spx: reality["spider-x"], type: network, path: wsPath(node), host: wsHost(node), serviceName: grpcName(node), alpn: node.alpn, packetEncoding: node["packet-encoding"], insecure: bool(node["skip-cert-verify"]) ? 1 : undefined });
  return `vless://${enc(node.uuid)}@${hostOf(node)}?${query}${nodeName(node)}`;
}

function yamlNodeToVmess(node: ProxyNode) {
  const network = node.network || (node["ws-opts"] ? "ws" : node["grpc-opts"] ? "grpc" : "tcp");
  const json = { v: "2", ps: node.name || "vmess", add: node.server, port: String(node.port || 443), id: node.uuid, aid: String(node.alterId ?? node.aid ?? 0), scy: node.cipher || "auto", net: network, type: "none", host: wsHost(node) || node.host || "", path: wsPath(node) || grpcName(node) || "", tls: bool(node.tls) ? "tls" : "", sni: node.servername || node.sni || "" };
  return `vmess://${b64(JSON.stringify(json))}`;
}

function yamlNodeToTrojan(node: ProxyNode) {
  const network = node.network || (node["ws-opts"] ? "ws" : "tcp");
  const query = q({ sni: node.sni || node.servername, type: network !== "tcp" ? network : undefined, path: wsPath(node), host: wsHost(node), allowInsecure: bool(node["skip-cert-verify"]) ? 1 : undefined });
  return `trojan://${enc(node.password)}@${hostOf(node)}${query ? `?${query}` : ""}${nodeName(node)}`;
}

function yamlNodeToHysteria(node: ProxyNode) {
  const query = q({ auth: node["auth-str"] || node.auth || node.password, protocol: node.protocol, upmbps: node.up, downmbps: node.down, peer: node.sni || node.servername, alpn: node.alpn, obfs: node.obfs, "obfs-password": node["obfs-password"], insecure: bool(node["skip-cert-verify"]) ? 1 : undefined });
  return `hysteria://${node.server}:${node.port || node.ports || 443}?${query}${nodeName(node)}`;
}

function yamlNodeToHysteria2(node: ProxyNode) {
  const query = q({ sni: node.sni || node.servername, alpn: node.alpn, obfs: node.obfs, "obfs-password": node["obfs-password"], insecure: bool(node["skip-cert-verify"]) ? 1 : undefined });
  return `hysteria2://${enc(node.password || node.auth || node.uuid)}@${hostOf(node)}${query ? `?${query}` : ""}${nodeName(node)}`;
}

function yamlNodeToTuic(node: ProxyNode) {
  const auth = node.token ? enc(node.token) : `${enc(node.uuid)}:${enc(node.password)}`;
  const query = q({ token: node.token ? node.token : undefined, sni: node.sni || node.servername, alpn: node.alpn, udp_relay_mode: node["udp-relay-mode"], congestion_control: node["congestion-controller"], allow_insecure: bool(node["skip-cert-verify"]) ? 1 : undefined });
  return `tuic://${auth}@${hostOf(node)}${query ? `?${query}` : ""}${nodeName(node)}`;
}

function yamlNodeToSs(node: ProxyNode) {
  const plugin = nested(node, "plugin-opts");
  const pluginText = node.plugin ? [node.plugin, plugin.mode ? `obfs=${plugin.mode}` : "", plugin.host ? `obfs-host=${plugin.host}` : ""].filter(Boolean).join(";") : "";
  const query = q({ plugin: pluginText || undefined });
  return `ss://${b64(`${node.cipher}:${node.password}`, true)}@${hostOf(node)}${query ? `/?${query}` : ""}${nodeName(node)}`;
}

function yamlNodeToSsr(node: ProxyNode) {
  const main = `${node.server}:${node.port}:${node.protocol || "origin"}:${node.cipher || node.method || "aes-256-gcm"}:${node.obfs || "plain"}:${b64(String(node.password || ""), true)}/?obfsparam=${b64(String(node["obfs-param"] || ""), true)}&protoparam=${b64(String(node["protocol-param"] || ""), true)}&remarks=${b64(String(node.name || "ssr"), true)}`;
  return `ssr://${b64(main, true)}`;
}

function yamlNodeToHttpSocks(node: ProxyNode) {
  const type = String(node.type || "").toLowerCase();
  const scheme = type === "http" && bool(node.tls) ? "https" : type === "socks5" ? "socks5" : type;
  const auth = node.username ? `${enc(node.username)}${node.password ? `:${enc(node.password)}` : ""}@` : "";
  const query = q({ insecure: bool(node["skip-cert-verify"]) ? 1 : undefined, udp: bool(node.udp) ? 1 : undefined });
  return `${scheme}://${auth}${hostOf(node)}${query ? `?${query}` : ""}${nodeName(node)}`;
}

function yamlNodeToSnell(node: ProxyNode) {
  const obfs = nested(node, "obfs-opts");
  const query = q({ version: node.version || 3, obfs: obfs.mode, "obfs-host": obfs.host });
  return `snell://${enc(node.psk || node.password)}@${hostOf(node)}?${query}${nodeName(node)}`;
}

function yamlNodeToGeneric(node: ProxyNode) {
  const type = String(node.type || "node").toLowerCase();
  const auth = node.username || node.password ? `${enc(node.username || node.password)}${node.username && node.password ? `:${enc(node.password)}` : ""}@` : "";
  const query = q(Object.fromEntries(Object.entries(node).filter(([key]) => !["name", "type", "server", "port", "username", "password"].includes(key))));
  return `${type}://${auth}${hostOf(node)}${query ? `?${query}` : ""}${nodeName(node)}`;
}

export function yamlNodeToUri(node: ProxyNode) {
  const type = String(node.type || "").toLowerCase();
  if (type === "vless") return yamlNodeToVless(node);
  if (type === "vmess") return yamlNodeToVmess(node);
  if (type === "trojan") return yamlNodeToTrojan(node);
  if (type === "hysteria") return yamlNodeToHysteria(node);
  if (type === "hysteria2" || type === "hy2") return yamlNodeToHysteria2(node);
  if (type === "tuic") return yamlNodeToTuic(node);
  if (type === "ss" || type === "shadowsocks") return yamlNodeToSs(node);
  if (type === "ssr") return yamlNodeToSsr(node);
  if (["http", "https", "socks", "socks5"].includes(type)) return yamlNodeToHttpSocks(node);
  if (type === "snell") return yamlNodeToSnell(node);
  if (["wireguard", "anytls", "ssh", "mieru"].includes(type)) return yamlNodeToGeneric(node);
  throw new Error(`不支持转换为 URI 的节点类型：${type || "空"}`);
}

export function yamlInputToUri(input: string) {
  return yamlToNodes(input).map(yamlNodeToUri).join("\n");
}

function splitFragment(uri: string) {
  const index = uri.indexOf("#");
  return index === -1 ? { base: uri, fragment: "" } : { base: uri.slice(0, index), fragment: uri.slice(index + 1) };
}

function firstIndexOfAny(input: string, chars: string[], start: number) {
  const indexes = chars.map((char) => input.indexOf(char, start)).filter((index) => index !== -1);
  return indexes.length ? Math.min(...indexes) : input.length;
}

function normalizeHostForUri(host: string) {
  const value = host.trim().replace(/^\[|\]$/g, "");
  if (!value || /\s/.test(value)) throw new Error("请输入有效的新地址");
  return value.includes(":") ? `[${value}]` : value;
}

function normalizeHostForNode(host: string) {
  return host.trim().replace(/^\[|\]$/g, "");
}

function hostPortParts(hostPort: string) {
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    if (end !== -1) return { host: hostPort.slice(0, end + 1), tail: hostPort.slice(end + 1) };
  }
  const colon = hostPort.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(hostPort.slice(colon + 1))) return { host: hostPort.slice(0, colon), tail: hostPort.slice(colon) };
  return { host: hostPort, tail: "" };
}

function rewriteAuthorityUri(uri: string, newHost: string) {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd === -1) throw new Error("请输入有效的 URI 节点");
  const scheme = uri.slice(0, schemeEnd).toLowerCase();
  const restStart = schemeEnd + 3;
  const authorityEnd = firstIndexOfAny(uri, ["/", "?"], restStart);
  const authority = uri.slice(restStart, authorityEnd);
  if (!authority) throw new Error(`无法识别节点地址：${uri}`);
  if (!authority.includes("@") && ["ss", "ssr", "vmess"].includes(scheme)) throw new Error("legacy");
  const at = authority.lastIndexOf("@");
  const userinfo = at === -1 ? "" : authority.slice(0, at + 1);
  const hostPort = authority.slice(at + 1);
  const { host, tail } = hostPortParts(hostPort);
  if (!host) throw new Error(`无法识别节点地址：${uri}`);
  return {
    scheme,
    oldHost: host.replace(/^\[|\]$/g, ""),
    oldPort: tail.startsWith(":") ? tail.slice(1) : "",
    rewritten: `${uri.slice(0, restStart)}${userinfo}${normalizeHostForUri(newHost)}${tail}${uri.slice(authorityEnd)}`,
  };
}

function rewriteLegacyUri(uri: string, newHost: string, name: string) {
  const node = uriToNode(uri);
  node.server = normalizeHostForNode(newHost);
  node.name = name;
  return yamlNodeToUri(node);
}

function rewriteUriLine(uri: string, newHost: string, remarkPrefix: string, index: number) {
  const { base, fragment } = splitFragment(uri);
  let rewritten = "";
  let fallbackName = "";
  try {
    const result = rewriteAuthorityUri(base, newHost);
    rewritten = result.rewritten;
    fallbackName = `${result.scheme}-${result.oldHost}-${result.oldPort || defaultPort(result.scheme)}`;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "legacy") throw error;
    const node = uriToNode(uri);
    const oldName = String(node.name || `${node.type}-${node.server}-${node.port || defaultPort(String(node.type || ""))}`);
    return rewriteLegacyUri(uri, newHost, `${remarkPrefix}${index}+${oldName}`);
  }
  const oldName = fragment ? decodeFragment(fragment) : fallbackName;
  return `${rewritten}#${remarkPrefix}${index}+${oldName}`;
}

export function rewriteUriInput(input: string, newHost: string, remarkPrefix = "加速节点") {
  const host = newHost.trim();
  if (!host) throw new Error("请输入新地址");
  const prefix = remarkPrefix.trim() || "加速节点";
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("请输入需要改写的 URI 节点");
  return lines.map((line, index) => rewriteUriLine(line, host, prefix, index + 1)).join("\n");
}
