import type { Edge } from '@/types'

export function wouldCycle(
  edges: Edge[],
  dependentId: number,
  prerequisiteId: number,
): boolean {
  if (dependentId === prerequisiteId) return true
  const adjacency = new Map<number, number[]>()
  for (const e of edges) {
    const list = adjacency.get(e.task_id)
    if (list) list.push(e.depends_on_task_id)
    else adjacency.set(e.task_id, [e.depends_on_task_id])
  }
  const stack = [prerequisiteId]
  const seen = new Set([prerequisiteId])
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === dependentId) return true
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return false
}
