import { nodeToYaml, uriToNode } from "../../src/lib/nodeConverter";

type ProxyNode = Record<string, unknown>;

export function proxyToYaml(node: ProxyNode, indent = 2) {
  return nodeToYaml(node, indent);
}

export function parseUriLines(input: string) {
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(uriToNode);
}
