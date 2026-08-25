import { useEffect, useMemo, useState } from 'react'
import {
  Link2,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  StickyNote,
  Swords,
  Trash2,
} from 'lucide-react'

import * as api from '@/lib/api'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { TaskForm } from '@/components/TaskForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useStore } from '@/store'
import type { ActivityEntry, TaskState } from '@/types'

const STATE_BADGE: Record<TaskState, { label: string; variant: 'locked' | 'available' | 'progress' | 'done' }> = {
  locked: { label: 'Locked', variant: 'locked' },
  available: { label: 'Available', variant: 'available' },
  in_progress: { label: 'In Progress', variant: 'progress' },
  done: { label: 'Done', variant: 'done' },
}

export const ACTIVITY_ICON: Record<string, string> = {
  task_complete: '✓',
  level_up: '★',
  task_reopen: '↺',
  progress: '✎',
}

function ProgressLog({ taskId }: { taskId: number }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.getActivity(taskId).then((rows) => {
      if (alive) setEntries(rows)
    })
    return () => {
      alive = false
    }
  }, [taskId])

  async function add() {
    if (note.trim() === '' || busy) return
    setBusy(true)
    try {
      await api.logProgress(taskId, note.trim())
      setNote('')
      const rows = await api.getActivity(taskId)
      setEntries(rows)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest">
        <StickyNote className="size-3.5" /> Progress log
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          placeholder="Log what you just did…"
          className="h-9 min-w-0 flex-1 border-[3px] border-black bg-white px-2 text-sm font-bold shadow-[3px_3px_0_0_#000] outline-none placeholder:text-black/40 focus-visible:bg-secondary"
        />
        <Button size="sm" variant="outline" className="h-9" disabled={busy || note.trim() === ''} onClick={() => void add()}>
          <Plus className="size-4" />
        </Button>
      </div>
      {entries.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {entries.map((entry, i) => (
            <li key={i} className="flex items-start gap-2 text-xs font-bold">
              <span className="w-4 text-center">{ACTIVITY_ICON[entry.type] ?? '•'}</span>
              <span className="min-w-0 flex-1">
                {entry.detail ?? entry.type}
                {entry.xp_delta !== 0 && (
                  <span className="ml-1 text-primary">
                    ({entry.xp_delta > 0 ? '+' : ''}
                    {entry.xp_delta} XP)
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[10px] opacity-60">
                {new Date(entry.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TaskDetailsSheet() {
  const payload = useStore((s) => s.payload)
  const taskId = useStore((s) => s.detailsTaskId)
  const task = payload?.tasks.find((t) => t.id === taskId)
  const project = payload?.projects.find((p) => p.id === task?.project_id)
  const dependents = useMemo(
    () =>
      payload?.edges
        .filter((e) => e.depends_on_task_id === taskId)
        .flatMap((e) => {
          const dependent = payload.tasks.find((t) => t.id === e.task_id)
          return dependent ? [dependent] : []
        }) ?? [],
    [payload, taskId],
  )
  const completeTask = useStore((s) => s.completeTask)
  const reopenTask = useStore((s) => s.reopenTask)
  const startPauseTask = useStore((s) => s.startPauseTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const saveTask = useStore((s) => s.saveTask)
  const setDetails = useStore((s) => s.setDetails)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <Sheet open={taskId !== null} onOpenChange={(open) => !open && setDetails(null)}>
      <SheetContent>
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {task && <Badge variant={STATE_BADGE[task.state].variant}>{STATE_BADGE[task.state].label}</Badge>}
            {task?.overdue && <Badge variant="overdue">Overdue</Badge>}
            {(dependents?.length ?? 0) > 0 && (
              <Badge variant="accent">
                <Link2 className="size-3" /> blocks {dependents!.length}
              </Badge>
            )}
            {task?.priority_score != null && (
              <Badge variant="secondary">P{Math.round(task.priority_score)}</Badge>
            )}
          </div>
          <SheetTitle className="pt-1">{task?.title}</SheetTitle>
          <SheetDescription>
            {project ? `In ${project.name}` : 'Unassigned'}
            {dependents && dependents.length > 0 && (
              <>
                {' '}· needed by{' '}
                <span className="text-foreground">{dependents.map((d) => d?.title).join(', ')}</span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {task && (
          <div className="flex flex-col gap-4 overflow-y-auto pr-1 -mr-1">
            <div className="flex flex-wrap gap-2">
              {task.status !== 'done' &&
                (task.status === 'in_progress' ? (
                  <Button variant="secondary" size="sm" onClick={() => startPauseTask(task.id, false)}>
                    <PauseCircle /> Pause
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => startPauseTask(task.id, true)}>
                    <PlayCircle /> Start
                  </Button>
                ))}
              {task.status !== 'done' && (
                <Button size="sm" onClick={(e) => completeTask(task.id, e.clientX, e.clientY)}>
                  <Swords /> Complete
                </Button>
              )}
              {task.status === 'done' && (
                <Button variant="outline" size="sm" onClick={() => reopenTask(task.id)}>
                  <RotateCcw /> Reopen
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive ml-auto"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 /> Delete
              </Button>
            </div>

            {task.status === 'done' && task.completed_at && (
              <p className="text-xs text-muted-foreground">
                Completed {new Date(task.completed_at).toLocaleString()}
              </p>
            )}

            <Separator />

            <ProgressLog taskId={task.id} />

            <Separator />

            <TaskForm
              key={task.id}
              initial={task}
              submitLabel="Save changes"
              onSubmit={(data) => saveTask(data, task.id)}
            />
          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        destructive
        confirmLabel="Delete quest"
        title={`Delete "${task?.title}"?`}
        description={
          dependents && dependents.length > 0
            ? `${dependents.length} task(s) depend on this (${dependents.map((d) => d?.title).join(', ')}). Their dependency links will be severed and they may become available.`
            : 'This cannot be undone.'
        }
        onConfirm={() => (task ? deleteTask(task.id) : Promise.resolve())}
      />
    </Sheet>
  )
}
