import Dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { LayoutDir } from '@/store'

export const NODE_W = 300
export const NODE_H = 116

export interface TaskNodeData extends Record<string, unknown> {
  taskId: number
  dir: LayoutDir
}

export function rankedLayout(
  tasks: {
    id: number
    state: string
    priority_score: number | null
    status: string
    deadline: string | null
  }[],
  edges: Edge[],
): { positions: Map<string, { x: number; y: number }>; tierTags: Map<string, string> } {
  const GAP_X = 70
  const GAP_Y = 30
  const MAX_ROWS = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(tasks.length * 1.6))))

  const prereqMap = new Map<number, number[]>()
  for (const e of edges) {
    const dependent = Number(e.target)
    const prerequisite = Number(e.source)
    const list = prereqMap.get(dependent)
    if (list) list.push(prerequisite)
    else prereqMap.set(dependent, [prerequisite])
  }
  const ids = new Set(tasks.map((t) => t.id))
  const tierMemo = new Map<number, number>()

  function tierOf(id: number, visiting: Set<number>): number {
    if (tierMemo.has(id)) return tierMemo.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const prereqs = (prereqMap.get(id) ?? []).filter((p) => ids.has(p))
    let tier = 0
    for (const p of prereqs) {
      const pt = tierOf(p, visiting)
      if (pt + 1 > tier) tier = pt + 1
    }
    visiting.delete(id)
    tierMemo.set(id, tier)
    return tier
  }

  const columns = new Map<number, typeof tasks>()
  for (const t of tasks) {
    const tier = tierOf(t.id, new Set())
    const col = columns.get(tier) ?? []
    col.push(t)
    columns.set(tier, col)
  }

  const positions = new Map<string, { x: number; y: number }>()
  const tierTags = new Map<string, string>()
  let chunkX = 40

  const sortedTiers = [...columns.entries()].sort((a, b) => a[0] - b[0])
  sortedTiers.forEach(([tier, col]) => {
    const sorted = [...col].sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0
      const bDone = b.status === 'done' ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      return (b.priority_score ?? -999) - (a.priority_score ?? -999)
    })
    const tag = tier === 0 ? 'NOW' : tier === 1 ? 'NEXT' : `LATER +${tier}`
    for (let i = 0; i < sorted.length; i += MAX_ROWS) {
      const chunk = sorted.slice(i, i + MAX_ROWS)
      chunk.forEach((t, row) => {
        positions.set(String(t.id), {
          x: chunkX,
          y: 56 + row * (NODE_H + GAP_Y),
        })
        if (row === 0 && !tierTags.has(String(t.id))) {
          tierTags.set(String(t.id), tag)
        }
      })
      chunkX += NODE_W + GAP_X
    }
    chunkX += GAP_X / 2
  })

  return { positions, tierTags }
}

export function layoutGraph(
  nodes: Node<TaskNodeData>[],
  edges: Edge[],
  dir: LayoutDir,
): Node<TaskNodeData>[] {
  const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: dir,
    nodesep: dir === 'LR' ? 34 : 60,
    ranksep: dir === 'LR' ? 90 : 70,
    marginx: 24,
    marginy: 24,
  })
  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_W, height: NODE_H })
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target)
  }
  Dagre.layout(graph)

  return nodes.map((node) => {
    const pos = graph.node(node.id)
    return {
      ...node,
      position: {
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H / 2,
      },
    }
  })
}
