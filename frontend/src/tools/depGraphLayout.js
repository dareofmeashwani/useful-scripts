// Layered left→right layout for a directed dependency graph.
// Columns = BFS depth from the roots (nodes with no incoming edge). Within a
// column, nodes are ordered by the average position of their parents (one
// barycenter sweep) to reduce edge crossings. Deterministic — no physics.

const NODE_W = 190
const NODE_H = 44
const COL_GAP = 110      // horizontal gap between columns
const ROW_GAP = 20       // vertical gap between nodes in a column
const PAD = 40

export function layout(nodes, edges, rootId) {
  if (!nodes.length) return { positioned: [], width: 0, height: 0 }

  const byId = new Map(nodes.map(n => [n.id, n]))
  const outAdj = new Map(nodes.map(n => [n.id, []]))
  const indeg = new Map(nodes.map(n => [n.id, 0]))
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    outAdj.get(e.from).push(e.to)
    indeg.set(e.to, indeg.get(e.to) + 1)
  }

  // Roots: zero in-degree nodes; fall back to the hinted root, then first node.
  let roots = nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id)
  if (!roots.length) roots = [rootId && byId.has(rootId) ? rootId : nodes[0].id]

  // BFS depth (longest path from any root so children sit right of parents).
  const depth = new Map()
  const queue = []
  for (const r of roots) { depth.set(r, 0); queue.push(r) }
  let head = 0
  const MAX_ITER = nodes.length * 8   // guard against cycles
  let iter = 0
  while (head < queue.length && iter++ < MAX_ITER) {
    const u = queue[head++]
    const du = depth.get(u)
    for (const v of outAdj.get(u)) {
      if (!depth.has(v) || depth.get(v) < du + 1) {
        depth.set(v, du + 1)
        queue.push(v)
      }
    }
  }
  // Any node never reached (part of a pure cycle) → depth 0.
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0)

  // Bucket into columns.
  const maxDepth = Math.max(...nodes.map(n => depth.get(n.id)))
  const columns = Array.from({ length: maxDepth + 1 }, () => [])
  for (const n of nodes) columns[depth.get(n.id)].push(n.id)

  // Order within each column by barycenter of parents' order in the prev column.
  const order = new Map()           // id → index within its column
  columns.forEach((col, d) => {
    if (d === 0) { col.forEach((id, i) => order.set(id, i)); return }
    const parentOrder = id => {
      const parents = edges.filter(e => e.to === id && depth.get(e.from) === d - 1)
      if (!parents.length) return Number.MAX_SAFE_INTEGER
      const sum = parents.reduce((s, e) => s + (order.get(e.from) ?? 0), 0)
      return sum / parents.length
    }
    col.sort((a, b) => parentOrder(a) - parentOrder(b))
    col.forEach((id, i) => order.set(id, i))
  })

  // Assign coordinates. Each column is vertically centered in the tallest column.
  const colHeights = columns.map(col => col.length * (NODE_H + ROW_GAP) - ROW_GAP)
  const maxColHeight = Math.max(0, ...colHeights)
  const positioned = []
  columns.forEach((col, d) => {
    const x = PAD + d * (NODE_W + COL_GAP)
    const yStart = PAD + (maxColHeight - colHeights[d]) / 2
    col.forEach((id, i) => {
      positioned.push({
        ...byId.get(id),
        x,
        y: yStart + i * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
      })
    })
  })

  const width = PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * COL_GAP
  const height = PAD * 2 + maxColHeight
  return { positioned, width, height }
}

export const NODE = { W: NODE_W, H: NODE_H }
