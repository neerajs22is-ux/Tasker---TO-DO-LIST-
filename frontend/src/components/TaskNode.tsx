import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarClock,
  CheckCircle2,
  Link2,
  Lock,
  Pencil,
  Star,
} from 'lucide-react'
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react'

import { Badge } from '@/components/ui/badge'
import { Flames } from '@/components/Flames'
import { wouldCycle } from '@/lib/cycles'
import { STATE_BADGE, STATE_COLORS, STATE_RING, fmtDate } from '@/lib/labels'
import { NODE_W } from '@/lib/layout'
import { pickRecommendation } from '@/lib/recommend'
import { cn } from '@/lib/utils'
import { useStore, type LayoutDir } from '@/store'

export interface TaskNodeData extends Record<string, unknown> {
  taskId: number
  dir: LayoutDir
  compact?: boolean
  tierTag?: string
}

export function TaskNode({ data, selected }: NodeProps) {
  const taskId = (data as TaskNodeData).taskId
  const dir = (data as TaskNodeData).dir
  const compact = (data as TaskNodeData).compact === true
  const tierTag = (data as TaskNodeData).tierTag
  const task = useStore((s) => s.payload?.tasks.find((t) => t.id === taskId))
  const project = useStore((s) =>
    s.payload?.projects.find((p) => p.id === task?.project_id),
  )
  const edges = useStore((s) => s.payload?.edges)
  const linkSource = useStore((s) => s.linkSource)
  const completeTask = useStore((s) => s.completeTask)
  const setDetails = useStore((s) => s.setDetails)
  const setLinkSource = useStore((s) => s.setLinkSource)

  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<number | null>(null)
  const freshIds = useStore((s) => s.freshIds)
  const isFresh = freshIds.includes(taskId)
  const unlocked = useStore((s) => s.unlockedIds.includes(taskId))
  const recommendedId = useStore((s) => {
    const tasks = s.payload?.tasks
    if (!tasks || tasks.length === 0) return null
    return pickRecommendation(tasks)?.id ?? null
  })

  const isLinkSource = linkSource === taskId
  const linkMode = linkSource !== null && !isLinkSource
  const rankedTagVisible = !!tierTag && !isFresh && !unlocked
  const isNext = recommendedId !== null && recommendedId === taskId && task?.state === 'available'
  const isValidTarget = useMemo(
    () =>
      linkSource === null ||
      taskId === undefined ||
      !wouldCycle(edges ?? [], taskId, linkSource),
    [edges, linkSource, taskId],
  )

  if (!task) return null

  const badge = STATE_BADGE[task.state]

  function enter() {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    setHovered(true)
  }
  function leave() {
    leaveTimer.current = window.setTimeout(() => setHovered(false), 140)
  }

  return (
    <div
      onMouseEnter={enter}
      onMouseLeave={leave}
      className={cn(
        'task-node relative h-full',
        isLinkSource && 'link-source',
        linkMode && 'link-target cursor-crosshair',
        linkMode && !isValidTarget && 'link-target-invalid',
        isFresh && 'fresh-node',
      )}
      style={{ width: NODE_W }}
      data-valid-target={linkMode && !isValidTarget ? 'false' : undefined}
    >
      {tierTag && rankedTagVisible && (
        <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 border-2 border-black bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-widest neo-shadow-sm">
          {tierTag}
        </span>
      )}
      {isFresh && (
        <span className="absolute -left-2 -top-3 z-10 -rotate-6 border-2 border-black bg-secondary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest neo-shadow-sm">
          New
        </span>
      )}
      {unlocked && (
        <span className="absolute -right-1 -top-3 z-10 rotate-3 animate-bounce border-2 border-black bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest neo-shadow-sm">
          Unlocked
        </span>
      )}
      {isNext && (
        <span className="absolute -left-3 -top-4 z-10 flex -rotate-3 items-center gap-1 border-[3px] border-black bg-destructive px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-black neo-shadow-sm">
          <Star className="size-3 fill-black" /> Do this next
        </span>
      )}
      <NodeToolbar isVisible={hovered || selected} offset={8}>
        <div
          className="flex items-center gap-1 rounded-lg border border-border bg-popover/95 p-1 shadow-xl backdrop-blur"
          onMouseEnter={enter}
          onMouseLeave={leave}
        >
          {task.status !== 'done' ? (
            <button
              title="Complete quest"
              className="flex size-7 items-center justify-center rounded-md text-emerald-300 transition-colors hover:bg-emerald-500/20"
              onClick={(e) => {
                e.stopPropagation()
                void completeTask(task.id, e.clientX, e.clientY)
              }}
            >
              <CheckCircle2 className="size-4" />
            </button>
          ) : null}
          <button
            title={
              isLinkSource ? 'Cancel linking' : 'Link from this quest (then click a target)'
            }
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors',
              isLinkSource
                ? 'bg-violet-500/30 text-violet-200'
                : 'text-violet-300 hover:bg-violet-500/20',
            )}
            onClick={(e) => {
              e.stopPropagation()
              setLinkSource(isLinkSource ? null : task.id)
            }}
          >
            <Link2 className="size-4" />
          </button>
          <button
            title="Open details"
            className="flex size-7 items-center justify-center rounded-md text-sky-300 transition-colors hover:bg-sky-500/20"
            onClick={(e) => {
              e.stopPropagation()
              setDetails(task.id)
            }}
          >
            <Pencil className="size-4" />
          </button>
        </div>
      </NodeToolbar>

      <Handle
        type="target"
        position={dir === 'LR' ? Position.Left : Position.Top}
        className="!z-10 !size-3.5 !rounded-none !border-2 !border-black !bg-white"
      />

      <motion.div
        key={`${task.status}`}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: [0.92, 1.03, 1], opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        title={`${task.title} — ${task.duration_estimate ?? '?'}h · importance ${task.importance} · blocks ${task.blocking_count}`}
        className={cn(
          'node-card relative flex h-full cursor-grab flex-col justify-between gap-1 border-[3px] border-black bg-white pl-5 pr-3 py-2 active:cursor-grabbing',
          task.state === 'locked' &&
            'border-dashed bg-[#fffdf5] opacity-70 [&_*]:opacity-90',
          task.state === 'available' && 'neo-shadow-md hover:shadow-[10px_10px_0_0_#000]',
          task.state === 'in_progress' && 'bg-muted neo-shadow-md',
          task.state === 'done' && 'bg-[#fffdf5] opacity-75 shadow-[4px_4px_0_0_#000]',
          selected && '!shadow-[8px_8px_0_0_#ff6b6b]',
          isNext && 'flame-border !border-black',
          STATE_RING[task.state],
        )}
      >
        <span
          className="absolute left-0 top-0 h-full w-2.5 border-r-[3px] border-black"
          style={{ background: STATE_COLORS[task.state] }}
        />
        {task.overdue && (
          <div className="pointer-events-none absolute inset-0 animate-hard-pulse border-[3px] border-black" />
        )}

        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {project && (
            <>
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: project.color }}
              />
              <span className="truncate">{project.name}</span>
            </>
          )}
          <span className="ml-auto flex items-center gap-1">
            {task.blocking_count > 0 && (
              <span className="flex items-center gap-0.5 text-violet-300/90">
                <Link2 className="size-3" />
                {task.blocking_count}
              </span>
            )}
            {task.state === 'locked' && <Lock className="size-3" />}
            {task.state === 'done' && (
              <CheckCircle2 className="size-3.5 text-teal-500" />
            )}
          </span>
        </div>

        <p
          className={cn(
            'line-clamp-2 text-[13px] font-medium leading-snug',
            task.state === 'done' && 'line-through decoration-teal-600',
          )}
        >
          {task.title}
        </p>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
          {task.duration_estimate != null && <span>{task.duration_estimate}h</span>}
          {task.priority_score != null && (
            <span
              className="bg-black px-1 font-black text-secondary"
              title="Priority score (urgency · importance · blocking − effort)"
            >
              P{Math.round(task.priority_score)}
            </span>
          )}
          {!compact && <Flames count={task.importance} />}
          {task.deadline && (
            <span className={cn(task.overdue && 'font-semibold text-red-400')}>
              <CalendarClock className="mr-0.5 inline size-3 align-[-2px]" />
              {fmtDate(task.deadline)}
            </span>
          )}
          <Badge variant={badge.variant} className="ml-auto !px-1 !py-0">
            {badge.label}
          </Badge>
        </div>
      </motion.div>

      <Handle
        type="source"
        position={dir === 'LR' ? Position.Right : Position.Bottom}
        className="!z-10 !size-3.5 !rounded-none !border-2 !border-black !bg-secondary"
      />
    </div>
  )
}
