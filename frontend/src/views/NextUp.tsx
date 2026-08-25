import { CalendarClock, Check, ChevronRight, Link2, LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'

import { Flames } from '@/components/Flames'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { fmtDate, STATE_RING } from '@/lib/labels'
import { pickRecommendation, readyQueue } from '@/lib/recommend'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

function CountsStrip() {
  const tasks = useStore((s) => s.payload?.tasks ?? [])
  const counts = {
    ready: tasks.filter((t) => t.state === 'available' || t.state === 'in_progress').length,
    locked: tasks.filter((t) => t.state === 'locked').length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => t.overdue).length,
  }
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(
        [
          ['Ready now', counts.ready, 'bg-secondary'],
          ['Locked', counts.locked, 'bg-white'],
          ['Done', counts.done, 'bg-muted'],
          ['Overdue', counts.overdue, 'bg-destructive'],
        ] as const
      ).map(([label, n, bg]) => (
        <div key={label} className={cn('border-[3px] border-black px-3 py-2', bg)}>
          <p className="text-xl font-black tabular-nums leading-none">{n}</p>
          <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest">{label}</p>
        </div>
      ))}
    </div>
  )
}

export function NextUpView() {
  const payload = useStore((s) => s.payload)
  const setDetails = useStore((s) => s.setDetails)
  const completeTask = useStore((s) => s.completeTask)
  const setCreating = useStore((s) => s.setCreating)
  const setView = useStore((s) => s.setView)
  const [busyId, setBusyId] = useState<number | null>(null)

  if (!payload) return null

  const hero = pickRecommendation(payload.tasks)
  const queue = readyQueue(payload.tasks).filter((t) => t.id !== hero?.id)
  const overdueCount = payload.tasks.filter((t) => t.overdue).length

  function complete(t: typeof hero, e: React.MouseEvent) {
    if (!t) return
    setBusyId(t.id)
    void completeTask(t.id, e.clientX, e.clientY).then(() => setBusyId(null))
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
      <CountsStrip />

      <h1 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest">
        Do this next
        <span className="h-[3px] flex-1 bg-black" />
      </h1>

      {hero ? (
        <motion.div
          key={hero.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flame-border relative border-4 border-black bg-white p-5 pl-6"
        >
          <span className="absolute -top-3.5 left-4 -rotate-2 border-2 border-black bg-secondary px-2 py-0.5 text-[10px] font-black uppercase tracking-widest neo-shadow-sm">
            ★ Your next move
          </span>
          {overdueCount > 0 && (
            <Badge variant="overdue" className="absolute -top-3 right-4 rotate-2">
              {overdueCount} overdue nearby
            </Badge>
          )}

          <h2 className="mt-2 pr-2 text-2xl font-black uppercase leading-tight tracking-tight">
            {hero.title}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold uppercase tracking-wide">
            {hero.project_id != null && (
              <span
                className="border-2 border-black px-1.5 py-0.5"
                style={{
                  background:
                    payload.projects.find((p) => p.id === hero.project_id)?.color ?? '#fff',
                }}
              >
                {payload.projects.find((p) => p.id === hero.project_id)?.name}
              </span>
            )}
            {hero.deadline && (
              <span className={cn('flex items-center gap-1', hero.overdue && 'text-destructive')}>
                <CalendarClock className="size-4" /> {fmtDate(hero.deadline)}
              </span>
            )}
            {hero.duration_estimate != null && <span>{hero.duration_estimate}h</span>}
              <Flames count={hero.importance} className="scale-125 origin-left" />
            {hero.blocking_count > 0 && (
              <span className="flex items-center gap-1">
                <Link2 className="size-3.5" /> unlocks {hero.blocking_count}
              </span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="lg" disabled={busyId === hero.id} onClick={(e) => complete(hero, e)} className="min-w-40">
              {busyId === hero.id ? <LoaderCircle className="animate-spin" /> : <Check />}
              DONE — +XP
            </Button>
            <Button variant="outline" size="lg" onClick={() => setDetails(hero.id)}>
              OPEN DETAILS <ChevronRight />
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="border-4 border-black bg-white p-8 text-center neo-shadow-md">
          <p className="text-lg font-black uppercase">Nothing ready right now</p>
          <p className="mt-1 text-sm font-bold">
            Every quest is either done or locked behind something.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setView('capture')}>
            <Plus /> Capture a new quest
          </Button>
        </div>
      )}

      {queue.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-black uppercase tracking-widest">
            Also ready ({queue.length})
            <span className="h-[3px] flex-1 bg-black" />
          </h2>
          <div className="space-y-2">
            {queue.map((t) => {
              const busy = busyId === t.id
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetails(t.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setDetails(t.id)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-3 border-[3px] border-black bg-white px-3 py-2.5 transition-transform duration-100 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_#000]',
                    STATE_RING[t.state],
                  )}
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      complete(t, e)
                    }}
                    className="shrink-0"
                  >
                    <Checkbox checked={false} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-bold">{t.title}</span>
                  {t.priority_score != null && (
                    <Badge variant="outline">P{Math.round(t.priority_score)}</Badge>
                  )}
                  {t.deadline && (
                    <span className="hidden items-center gap-1 text-xs font-bold sm:flex">
                      <CalendarClock className="size-3.5" /> {fmtDate(t.deadline)}
                    </span>
                  )}
                  {busy && <LoaderCircle className="size-4 animate-spin" />}
                  <ChevronRight className="size-4 shrink-0" />
                </div>
              )
            })}
          </div>
        </>
      )}

      {!hero && queue.length === 0 && (
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus /> New quest manually
        </Button>
      )}

      <div className="mt-10 flex items-center justify-between border-t-4 border-black pt-4 pb-6">
        <p className="text-xs font-bold uppercase tracking-widest">
          {payload.tasks.filter((t) => t.status !== 'done').length} open quests on the tree
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setView('board')}>
            BOARD
          </Button>
          <Button variant="outline" size="sm" onClick={() => setView('graph')}>
            GRAPH
          </Button>
        </div>
      </div>
    </div>
  )
}
