import { nodeToYaml, uriToNode } from "../../src/lib/nodeConverter";

type ProxyNode = Record<string, unknown>;

export function proxyToYaml(node: ProxyNode, indent = 2) {
  return nodeToYaml(node, indent);
}

export function parseUriLines(input: string) {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    try {
      return uriToNode(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "解析失败";
      throw new Error(`第 ${index + 1} 行: ${reason}`);
    }
  });
}
