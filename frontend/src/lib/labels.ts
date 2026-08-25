import type { TaskState } from '@/types'

export const STATE_BADGE: Record<
  TaskState,
  { label: string; variant: 'locked' | 'available' | 'progress' | 'done' }
> = {
  locked: { label: 'Locked', variant: 'locked' },
  available: { label: 'Available', variant: 'available' },
  in_progress: { label: 'In Progress', variant: 'progress' },
  done: { label: 'Done', variant: 'done' },
}

export const STATE_COLORS: Record<TaskState, string> = {
  locked: '#e8e2d0',
  available: '#ffd93d',
  in_progress: '#c4b5fd',
  done: '#ffffff',
}

export const STATE_RING: Record<TaskState, string> = {
  locked: 'ring-inset ring-2 ring-black/40',
  available: 'ring-inset ring-[3px] ring-[#ffd93d]',
  in_progress: 'ring-inset ring-[3px] ring-[#c4b5fd]',
  done: 'ring-inset ring-2 ring-black/30',
}

export function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: d.getHours() === 0 && d.getMinutes() === 0 ? undefined : '2-digit',
    minute: d.getHours() === 0 && d.getMinutes() === 0 ? undefined : '2-digit',
  })
}
