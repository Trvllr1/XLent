/** Layered left-to-right layout for the dependency DAG (longest-path layering). */

export interface LayoutNode {
  id: string;
  layer: number;
  x: number;
  y: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  width: number;
  height: number;
}

const NODE_W = 180;
const NODE_H = 34;
const LAYER_GAP = 70;
const ROW_GAP = 12;

export function layoutGraph(nodes: string[], edges: { from: string; to: string }[]): LayoutResult {
  const inEdges = new Map<string, string[]>();
  for (const n of nodes) inEdges.set(n, []);
  for (const e of edges) inEdges.get(e.to)?.push(e.from);

  // layer(v) = 0 for roots, else 1 + max(layer of parents); cycle-safe via iteration cap
  const layer = new Map<string, number>();
  const remaining = new Set(nodes);
  for (let pass = 0; pass < nodes.length && remaining.size > 0; pass++) {
    for (const n of Array.from(remaining)) {
      const parents = inEdges.get(n) ?? [];
      if (parents.length === 0) {
        layer.set(n, 0);
        remaining.delete(n);
      } else if (parents.every((p) => layer.has(p) || !inEdges.has(p))) {
        layer.set(n, 1 + Math.max(...parents.map((p) => layer.get(p) ?? 0)));
        remaining.delete(n);
      }
    }
  }
  // Anything still unresolved (cycles) goes to the deepest layer + 1
  if (remaining.size > 0) {
    const max = Math.max(0, ...Array.from(layer.values()));
    for (const n of remaining) layer.set(n, max + 1);
  }

  const layers = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(id);
  }

  const out: LayoutNode[] = [];
  let height = 0;
  const layerCount = layers.size;
  for (const [l, ids] of Array.from(layers.entries()).sort((a, b) => a[0] - b[0])) {
    ids.sort();
    ids.forEach((id, i) => {
      const y = i * (NODE_H + ROW_GAP) + NODE_H;
      out.push({ id, layer: l, x: l * (NODE_W + LAYER_GAP), y });
      height = Math.max(height, y + NODE_H);
    });
  }

  return { nodes: out, width: layerCount * (NODE_W + LAYER_GAP) + LAYER_GAP, height };
}

export const NODE_SIZE = { w: NODE_W, h: NODE_H };
