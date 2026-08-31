import type { SubscriptionInput } from "./types";
import { parseUriLines, proxyToYaml } from "./uriParser";
import { parse as parseYaml } from "yaml";

function scalar(value: string) {
  const text = value.trim();
  if (/^[\w.@:/%+\-[\]\u4e00-\u9fa5🛫 ]+$/u.test(text) && text !== "") return text;
  return JSON.stringify(text);
}

const airportIcon = "🛫";

function providerGroupTitle(name: string) {
  return `${airportIcon} ${name}`;
}

function isTopLevelKey(line: string) {
  return /^[^\s#][^:]*:\s*/.test(line);
}

function sectionRange(lines: string[], key: string) {
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*`).test(line));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !isTopLevelKey(lines[end])) end += 1;
  return { start, end };
}

function insertIndexByMarker(lines: string[], marker: string) {
  const found = lines.findIndex((line) => line.includes(marker));
  if (found < 0) return lines.length;
  let index = found + 1;
  while (index < lines.length && lines[index].trim().startsWith("#")) index += 1;
  while (index < lines.length && lines[index].trim() === "") index += 1;
  return index;
}

function stripOuterFence(input: string) {
  const text = input.trim();
  const match = text.match(/^```(?:yaml|yml)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function normalizeProxyEntries(lines: string[]) {
  const trimmed = lines.map((line) => line.replace(/\s+$/g, ""));
  while (trimmed.length && !trimmed[0].trim()) trimmed.shift();
  while (trimmed.length && !trimmed[trimmed.length - 1].trim()) trimmed.pop();
  const first = trimmed.find((line) => line.trim().startsWith("- "));
  const baseIndent = first ? first.match(/^\s*/)?.[0].length || 0 : 0;
  return trimmed.map((line) => {
    if (!line.trim()) return "";
    const normalized = line.startsWith(" ".repeat(baseIndent)) ? line.slice(baseIndent) : line.trimStart();
    return `  ${normalized}`;
  }).join("\n");
}

function extractProxyEntries(input: string) {
  const text = stripOuterFence(input).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const range = sectionRange(lines, "proxies");
  if (range) return normalizeProxyEntries(lines.slice(range.start + 1, range.end));
  return normalizeProxyEntries(lines);
}

function looksLikeYaml(input: string) {
  const text = stripOuterFence(input);
  if (/^proxies:\s*/m.test(text)) return true;
  return text.split(/\r?\n/).some((line) => /^\s*-\s+name\s*:/.test(line)) && text.includes("type:");
}

function proxyEntries(input: string) {
  const text = stripOuterFence(input).trim();
  if (!text) return "";
  if (looksLikeYaml(text)) return extractProxyEntries(text);
  const nodes = parseUriLines(text);
  return nodes.map((node) => proxyToYaml(node, 2)).join("\n");
}

function providerEntries(subscriptions: SubscriptionInput[]) {
  const lines: string[] = [];
  for (const item of subscriptions) {
    const prefix = item.prefix.trim();
    lines.push(`  ${scalar(prefix)}:`);
    lines.push(`    url: ${JSON.stringify(item.url.trim())}`);
    lines.push("    type: http");
    lines.push("    interval: 86400");
    lines.push("    health-check: { enable: true, url: https://www.gstatic.com/generate_204, interval: 300 }");
    lines.push(`    override: { udp: true, additional-prefix: ${JSON.stringify(`[${prefix}]`)} }`);
    lines.push("");
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function appendTopLevelSection(template: string, key: string, entries: string, emptyValue: string, marker: string) {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const range = sectionRange(lines, key);
  if (range) {
    if (!entries) return template;
    const head = lines[range.start].trim();
    if (head === `${key}: []` || head === `${key}: {}`) return [...lines.slice(0, range.start), `${key}:`, ...entries.split("\n"), ...lines.slice(range.end)].join("\n");
    let insertAt = range.end;
    while (insertAt > range.start + 1 && (lines[insertAt - 1].trim() === "" || lines[insertAt - 1].trim().startsWith("#"))) insertAt -= 1;
    return [...lines.slice(0, insertAt), "", ...entries.split("\n"), ...lines.slice(insertAt)].join("\n");
  }
  const block = entries ? `${key}:\n${entries}` : `${key}: ${emptyValue}`;
  const index = insertIndexByMarker(lines, marker);
  return [...lines.slice(0, index), ...block.split("\n"), "", ...lines.slice(index)].join("\n");
}

function groupStart(line: string) {
  return /^\s*-\s*name\s*:/.test(line);
}

function groupName(line: string) {
  return line.match(/^\s*-\s*name\s*:\s*(.+?)\s*$/)?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
}

function groupEnd(lines: string[], start: number) {
  let end = start + 1;
  while (end < lines.length && !groupStart(lines[end]) && !isTopLevelKey(lines[end])) end += 1;
  return end;
}

function isProxyGroupsKey(line: string) {
  return /^proxy-groups:\s*(?:\[\]|\{\})?\s*(?:#.*)?$/.test(line);
}

function findProxyGroupsStart(lines: string[]) {
  return lines.findIndex(isProxyGroupsKey);
}

function findProxyGroup(lines: string[], matcher: (name: string) => boolean) {
  const pg = findProxyGroupsStart(lines);
  if (pg < 0) return -1;
  return lines.findIndex((line, index) => index > pg && groupStart(line) && matcher(groupName(line)));
}

function findNodeSelectGroup(lines: string[]) {
  const byName = findProxyGroup(lines, (name) => name.includes("节点选择"));
  if (byName >= 0) return byName;
  const pg = findProxyGroupsStart(lines);
  if (pg < 0) return -1;
  for (let index = pg + 1; index < lines.length; index += 1) {
    if (!groupStart(lines[index])) continue;
    const end = groupEnd(lines, index);
    const body = lines.slice(index, end).join("\n");
    if (/type:\s*select\b/.test(body) && /-\s*DIRECT\b|\[.*\bDIRECT\b/.test(body)) return index;
    index = end - 1;
  }
  return -1;
}

function parseScalar(value: string) {
  try {
    const parsed = parseYaml(value);
    return typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    return value.trim().replace(/^['"]|['"]$/g, "");
  }
}

function inlineProxyNames(line: string) {
  const match = line.match(/^\s*proxies\s*:\s*(\[.*\])\s*(?:#.*)?$/);
  if (!match) return null;
  try {
    const parsed = parseYaml(`proxies: ${match[1]}`)?.proxies;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function proxyListEnd(lines: string[], proxiesIndex: number, groupLimit: number) {
  const propertyIndent = lines[proxiesIndex].match(/^\s*/)?.[0].length || 0;
  let index = proxiesIndex + 1;
  while (index < groupLimit) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) {
      index += 1;
      continue;
    }
    const indent = line.match(/^\s*/)?.[0].length || 0;
    if (indent <= propertyIndent) break;
    index += 1;
  }
  return index;
}

function addToNodeSelectGroup(template: string, names: string[]) {
  if (!names.length) return template;
  const lines = template.split("\n");
  const groupIndex = findNodeSelectGroup(lines);
  if (groupIndex < 0) return template;
  const end = groupEnd(lines, groupIndex);
  const proxiesIndex = lines.findIndex((line, index) => index > groupIndex && index < end && /^\s*proxies\s*:/.test(line));
  if (proxiesIndex < 0) {
    const insertAt = groupIndex + 1;
    lines.splice(insertAt, 0, "    proxies:", ...names.map((name) => `      - ${scalar(name)}`));
    return lines.join("\n");
  }

  const inlineNames = inlineProxyNames(lines[proxiesIndex]);
  if (inlineNames) {
    const existing = new Set(inlineNames);
    const additions = names.filter((name) => !existing.has(name));
    if (!additions.length) return lines.join("\n");
    const anchor = inlineNames.findIndex((name) => name.includes("香港智能筛选"));
    inlineNames.splice(anchor >= 0 ? anchor + 1 : inlineNames.length, 0, ...additions);
    const indent = lines[proxiesIndex].match(/^\s*/)?.[0] || "";
    lines[proxiesIndex] = `${indent}proxies: [${inlineNames.map(scalar).join(", ")}]`;
    return lines.join("\n");
  }

  const listEnd = proxyListEnd(lines, proxiesIndex, end);
  const entries = lines.slice(proxiesIndex + 1, listEnd).map((line, offset) => {
    const match = line.match(/^\s*-\s*(.+?)\s*$/);
    return match ? { index: proxiesIndex + 1 + offset, name: parseScalar(match[1]) } : null;
  }).filter((entry): entry is { index: number; name: string } => Boolean(entry));
  const existing = new Set(entries.map((entry) => entry.name));
  const additions = names.filter((name) => !existing.has(name)).map((name) => `      - ${scalar(name)}`);
  if (!additions.length) return lines.join("\n");
  const hongKongSmart = entries.find((entry) => entry.name.includes("香港智能筛选"));
  const insertAt = hongKongSmart ? hongKongSmart.index + 1 : listEnd;
  return [...lines.slice(0, insertAt), ...additions, ...lines.slice(insertAt)].join("\n");
}

function existingGroupNames(lines: string[]) {
  return new Set(lines.map(groupName).filter(Boolean));
}

function providerGroupRef(existing: Set<string>, name: string) {
  const titled = providerGroupTitle(name);
  if (existing.has(titled)) return titled;
  if (existing.has(name)) return name;
  return titled;
}

function providerGroupRefs(template: string, names: string[]) {
  const existing = existingGroupNames(template.split("\n"));
  return names.map((name) => providerGroupRef(existing, name));
}

function insertGroupBlock(lines: string[], index: number, block: string) {
  let before = index;
  while (before > 0 && lines[before - 1].trim() === "") before -= 1;
  let after = index;
  while (after < lines.length && lines[after].trim() === "") after += 1;
  return [...lines.slice(0, before), "", ...block.split("\n"), "", ...lines.slice(after)].join("\n");
}

function addProviderGroups(template: string, names: string[]) {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const existing = existingGroupNames(lines);
  const missing = names.filter((name) => !existing.has(name) && !existing.has(providerGroupTitle(name)));
  if (!missing.length) return template;
  const groups = missing.map((name) => `  - name: ${scalar(providerGroupTitle(name))}\n    type: select\n    use: [${scalar(name)}]`).join("\n\n");
  const microsoft = findProxyGroup(lines, (name) => name.toLowerCase() === "microsoft");
  if (microsoft >= 0) return insertGroupBlock(lines, microsoft, groups);
  const pg = findProxyGroupsStart(lines);
  if (pg >= 0) {
    const head = lines[pg].trim().replace(/\s+#.*$/, "");
    if (head === "proxy-groups: []" || head === "proxy-groups: {}") {
      return [...lines.slice(0, pg), "proxy-groups:", ...groups.split("\n"), ...lines.slice(pg + 1)].join("\n");
    }
    const range = sectionRange(lines, "proxy-groups");
    const insertAt = range ? range.end : lines.length;
    return insertGroupBlock(lines, insertAt, groups);
  }
  return `${template}\nproxy-groups:\n${groups}\n`;
}

export function generateConfig(template: string, nodeInput: string, subscriptions: SubscriptionInput[]) {
  const cleanSubs = subscriptions.map((item) => ({ prefix: item.prefix.trim(), url: item.url.trim() })).filter((item) => item.prefix && item.url);
  const names = cleanSubs.map((item) => item.prefix);
  let output = template.replace(/\r\n/g, "\n");
  output = appendTopLevelSection(output, "proxies", proxyEntries(nodeInput), "[]", "静态节点");
  output = appendTopLevelSection(output, "proxy-providers", providerEntries(cleanSubs), "{}", "机场订阅");
  output = addToNodeSelectGroup(output, providerGroupRefs(output, names));
  output = addProviderGroups(output, names);
  return output.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
