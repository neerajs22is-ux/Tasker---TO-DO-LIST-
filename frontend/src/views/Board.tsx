import { CalendarClock, ChevronRight, LoaderCircle, Lock } from 'lucide-react'
import { useState } from 'react'

import { Flames } from '@/components/Flames'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { fmtDate, STATE_RING } from '@/lib/labels'
import { pickRecommendation } from '@/lib/recommend'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { Task } from '@/types'

function blockerLabel(task: Task, tasks: Task[], edges: { task_id: number; depends_on_task_id: number }[]) {
  const open = edges
    .filter((e) => e.task_id === task.id)
    .map((e) => tasks.find((t) => t.id === e.depends_on_task_id))
    .filter((t): t is Task => !!t && t.status !== 'done')
  if (open.length === 0) return null
  return open
    .slice(0, 2)
    .map((t) => t.title)
    .join(', ')
}

function PriorityFlag({ level }: { level: number }) {
  const cfg =
    level >= 5
      ? { bg: '#ff6b6b', size: 'text-base px-2' }
      : level === 4
        ? { bg: '#ffa8a8', size: 'text-sm px-1.5' }
        : level === 3
          ? { bg: '#ffd93d', size: 'text-xs px-1.5' }
          : { bg: '#c4b5fd', size: 'text-xs px-1.5' }
  return (
    <span
      className={cn(
        'pflag absolute -right-2 -top-2.5 rotate-3 border-2 border-black font-black leading-none neo-shadow-sm',
        cfg.size,
      )}
      style={{ background: cfg.bg }}
      title={`Priority ${level} of 5`}
    >
      P{level}
    </span>
  )
}

export function BoardCard({ task, isNext }: { task: Task; isNext: boolean }) {
  const setDetails = useStore((s) => s.setDetails)
  const completeTask = useStore((s) => s.completeTask)
  const reopenTask = useStore((s) => s.reopenTask)
  const isFresh = useStore((s) => s.freshIds.includes(task.id))
  const unlocked = useStore((s) => s.unlockedIds.includes(task.id))
  const payload = useStore((s) => s.payload)
  const done = task.status === 'done'
  const locked = task.state === 'locked'
  const blocker = locked && payload ? blockerLabel(task, payload.tasks, payload.edges) : null
  const [busy, setBusy] = useState(false)

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (locked || busy) return
    if (done) void reopenTask(task.id)
    else {
      setBusy(true)
      void completeTask(task.id, e.clientX, e.clientY).then(() => setBusy(false))
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setDetails(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && setDetails(task.id)}
      className={cn(
        'group relative cursor-pointer border-[3px] border-black bg-white p-3 pl-4 transition-all duration-100 ease-linear hover:-translate-y-0.5',
        done && 'opacity-60',
        locked && 'border-dashed bg-[#fffdf5]',
        unlocked && 'fresh-node',
        isNext && 'flame-border !border-black',
        STATE_RING[task.state],
      )}
    >
      <span
        className="absolute left-0 top-0 h-full w-2 border-r-2 border-black"
        style={{
          background:
            task.state === 'available'
              ? '#ffd93d'
              : task.state === 'in_progress'
                ? '#c4b5fd'
                : task.overdue
                  ? '#ff6b6b'
                  : task.state === 'done'
                    ? '#fffdf5'
                    : '#fff',
        }}
      />

      {task.importance >= 3 && <PriorityFlag level={task.importance} />}

      {(isFresh || unlocked) && (
        <span className="absolute -right-2 top-6 rotate-3 border-2 border-black bg-secondary px-1.5 text-[9px] font-black uppercase tracking-widest neo-shadow-sm">
          {unlocked ? 'Unlocked' : 'New'}
        </span>
      )}

      <div className="flex items-start gap-2 pl-2">
        {!locked && !done && (
          <span onClick={toggle} className="pt-0.5">
            <Checkbox checked={false} />
          </span>
        )}
        <p
          className={cn(
            'min-w-0 flex-1 text-sm font-bold leading-snug',
            done && 'line-through',
          )}
        >
          {locked && <Lock className="mr-1 inline size-3.5 align-[-2px]" />}
          {task.title}
        </p>
        {task.priority_score != null && !locked && (
          <Badge variant="outline" className="shrink-0 border-black">
            P{Math.round(task.priority_score)}
          </Badge>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-2 text-[10px] font-bold uppercase tracking-wide">
        {task.duration_estimate != null && <span>{task.duration_estimate}h</span>}
        <Flames count={task.importance} />
        {task.deadline && (
          <span className={cn('flex items-center gap-0.5', task.overdue && 'text-destructive')}>
            <CalendarClock className="size-3" /> {fmtDate(task.deadline)}
          </span>
        )}
        {busy && <LoaderCircle className="size-3.5 animate-spin" />}
      </div>

      {blocker && (
        <p className="mt-2 flex items-center gap-1 pl-2 text-[11px] font-bold text-black/70">
          needs: <span className="underline decoration-dotted">{blocker}</span>
        </p>
      )}

      {!locked && !done && (
        <ChevronRight className="absolute bottom-2 right-2 size-4 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </div>
  )
}

export function BoardView() {
  const payload = useStore((s) => s.payload)

  if (!payload) return null

  const nextId = pickRecommendation(payload.tasks)?.id ?? -1

  if (!payload) return null

  const columns: { key: string; title: string; bg: string; tasks: Task[] }[] = [
    {
      key: 'available',
      title: 'Available now',
      bg: 'bg-secondary',
      tasks: payload.tasks.filter((t) => t.state === 'available'),
    },
    {
      key: 'progress',
      title: 'In progress',
      bg: 'bg-muted',
      tasks: payload.tasks.filter((t) => t.state === 'in_progress'),
    },
    {
      key: 'locked',
      title: 'Locked',
      bg: 'bg-white',
      tasks: payload.tasks.filter((t) => t.state === 'locked'),
    },
    {
      key: 'done',
      title: 'Recently done',
      bg: 'bg-[#fffdf5]',
      tasks: payload.tasks
        .filter((t) => t.status === 'done')
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
        .slice(0, 8),
    },
  ]

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden p-4">
      <div className="grid h-full min-h-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <section
            key={col.key}
            className="flex min-h-0 flex-col border-4 border-black bg-background"
          >
            <header className={cn('flex items-center gap-2 border-b-4 border-black px-3 py-2.5', col.bg)}>
              <h2 className="text-xs font-black uppercase tracking-widest">{col.title}</h2>
              <Badge variant="outline" className="ml-auto border-black bg-white">
                {col.tasks.length}
              </Badge>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {col.tasks.map((t) => (
                <BoardCard key={t.id} task={t} isNext={t.id === nextId && col.key === 'available'} />
              ))}
              {col.tasks.length === 0 && (
                <p className="border-2 border-dashed border-black/30 p-4 text-center text-xs font-bold uppercase tracking-widest opacity-50">
                  Empty
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
