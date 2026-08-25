import type { Task } from '@/types'

const STATE_RANK: Record<string, number> = { available: 0, in_progress: 0, locked: 1, done: 2 }

export function isReady(t: Task): boolean {
  return t.state === 'available' || t.state === 'in_progress'
}

export function pickRecommendation(tasks: Task[]): Task | null {
  const ready = tasks.filter(isReady)
  if (ready.length === 0) return null
  return [...ready].sort((a, b) => {
    const p = (b.priority_score ?? -999) - (a.priority_score ?? -999)
    if (p !== 0) return p
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return a.id - b.id
  })[0]
}

export function readyQueue(tasks: Task[]): Task[] {
  return tasks
    .filter(isReady)
    .sort((a, b) => (b.priority_score ?? -999) - (a.priority_score ?? -999))
}

export function sortForBoard(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ra = STATE_RANK[a.state] ?? 3
    const rb = STATE_RANK[b.state] ?? 3
    if (ra !== rb) return ra - rb
    return (b.priority_score ?? -999) - (a.priority_score ?? -999)
  })
}
