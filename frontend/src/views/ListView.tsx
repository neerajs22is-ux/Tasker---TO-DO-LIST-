import { useState } from 'react'
import { CalendarClock, ChevronRight, LoaderCircle, Plus } from 'lucide-react'

import { Flames } from '@/components/Flames'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { STATE_BADGE, fmtDate } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { Project, Task } from '@/types'

function QuickAddBar() {
  const saveTask = useStore((s) => s.saveTask)
  const setCreating = useStore((s) => s.setCreating)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = title.trim()
    if (trimmed === '' || busy) return
    setBusy(true)
    await saveTask({
      title: trimmed,
      description: null,
      duration_estimate: null,
      importance: 3,
      deadline: null,
      project_id: null,
    })
    setTitle('')
    setBusy(false)
  }

  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="relative flex-1">
        <Plus className="absolute left-3 top-1/2 size-6 -translate-y-1/2 stroke-[3] text-black" />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="QUICK ADD A QUEST — PRESS ENTER"
          className="h-14 pl-12 pr-12 text-lg uppercase placeholder:text-base placeholder:normal-case placeholder:tracking-widest"
        />
        {busy && (
          <LoaderCircle className="absolute right-4 top-1/2 size-6 -translate-y-1/2 animate-spin" />
        )}
      </div>
      <Button variant="outline" className="h-14 shrink-0 px-5" onClick={() => setCreating(true)}>
        FULL FORM
      </Button>
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const setDetails = useStore((s) => s.setDetails)
  const completeTask = useStore((s) => s.completeTask)
  const reopenTask = useStore((s) => s.reopenTask)
  const isFresh = useStore((s) => s.freshIds.includes(task.id))
  const done = task.status === 'done'
  const badge = STATE_BADGE[task.state]

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (done) {
      void reopenTask(task.id)
    } else {
      void completeTask(task.id, e.clientX, e.clientY)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setDetails(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && setDetails(task.id)}
      className={cn(
        'group flex cursor-pointer items-start gap-3 border-l-8 px-4 py-4 transition-all duration-100 ease-linear hover:bg-secondary/60 focus-visible:bg-secondary/40 focus-visible:outline-none sm:px-5',
        isFresh
          ? 'border-violet-300 bg-secondary/50'
          : 'border-transparent hover:border-black',
      )}
    >
      <span onClick={toggle} className="pt-0.5">
        <Checkbox checked={done} className={cn('transition-transform hover:scale-110', done && 'opacity-80')} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'text-sm font-medium transition-colors',
              done ? 'text-muted-foreground line-through' : 'group-hover:text-primary',
            )}
          >
            {task.title}
          </span>
          {isFresh && <Badge variant="accent">new</Badge>}
          {task.overdue && <Badge variant="overdue">Overdue</Badge>}
          {task.state !== 'available' && (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
          {task.duration_estimate != null && <span>{task.duration_estimate}h</span>}
          {task.deadline && (
            <span className={cn(task.overdue && 'font-semibold text-red-400')}>
              <CalendarClock className="mr-0.5 inline size-3 align-[-2px]" />
              {fmtDate(task.deadline)}
            </span>
          )}
          <Flames count={task.importance} />
          {task.blocking_count > 0 && (
            <span title="Dependent quests waiting">blocks {task.blocking_count}</span>
          )}
        </div>
      </div>

      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" />
    </div>
  )
}

function Section({
  project,
  tasks,
}: {
  project: Project | null
  tasks: Task[]
}) {
  const doneCount = tasks.filter((t) => t.status === 'done').length
  return (
    <section className="border-4 border-black bg-white neo-shadow-md">
      <header className="flex items-center gap-2 border-b-4 border-black bg-muted/40 px-4 py-3">
        {project ? (
          <>
            <span className="size-4 border-2 border-black" style={{ background: project.color }} />
            <h2 className="text-base font-black uppercase tracking-widest">{project.name}</h2>
          </>
        ) : (
          <h2 className="text-base font-black uppercase tracking-widest">Unassigned</h2>
        )}
        <Badge variant="secondary" className="ml-auto">
          {doneCount}/{tasks.length} done
        </Badge>
      </header>
      <div className="divide-y-[3px] divide-black">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </section>
  )
}

export function ListView() {
  const payload = useStore((s) => s.payload)
  const hidden = useStore((s) => s.hiddenProjects)
  const setView = useStore((s) => s.setView)

  if (!payload) return null

  const projects = payload.projects.filter((p) => !hidden.includes(p.id))
  const sections = [
    ...projects.map((project) => ({
      project,
      tasks: payload.tasks.filter((t) => t.project_id === project.id),
    })),
    {
      project: null,
      tasks: payload.tasks.filter((t) => t.project_id == null),
    },
  ].filter((s) => s.tasks.length > 0)

  const total = payload.tasks.length
  const doneTotal = payload.tasks.filter((t) => t.status === 'done').length

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {doneTotal} of {total} quests complete
        </p>
        <Button variant="outline" size="sm" onClick={() => setView('capture')}>
          <Plus /> Capture more
        </Button>
      </div>

      <QuickAddBar />

      {sections.length === 0 ? (
        <div className="mt-20 flex flex-col items-center gap-3 text-center">
          <div className="text-4xl">⚔️</div>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Nothing here yet. Type a quest above and press Enter — it lands on the skill tree.
          </p>
        </div>
      ) : (
        <div className="space-y-5 pb-10">
          {sections.map((s, i) =>
            s.project ? (
              <Section key={s.project.id} project={s.project} tasks={s.tasks} />
            ) : (
              <Section key={`unassigned-${i}`} project={null} tasks={s.tasks} />
            ),
          )}
        </div>
      )}
    </div>
  )
}
