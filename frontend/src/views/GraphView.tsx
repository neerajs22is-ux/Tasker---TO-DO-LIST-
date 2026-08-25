import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MiniMap,
  ReactFlow,
  SelectionMode,
  getSmoothStepPath,
  useNodesState,
  type Connection,
  type Edge as RfEdge,
  type EdgeChange,
  type EdgeProps,
  type Node as RfNode,
} from '@xyflow/react'
import {
  Layers,
  Link2,
  ListTodo,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { TaskNode, type TaskNodeData } from '@/components/TaskNode'
import { Button } from '@/components/ui/button'
import { wouldCycle } from '@/lib/cycles'
import { layoutGraph, rankedLayout } from '@/lib/layout'
import { STATE_BADGE, STATE_COLORS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { Project, Task } from '@/types'

const NO_PROJECTS: Project[] = []
const nodeTypes = { taskNode: TaskNode }
const edgeTypes = { glow: GlowEdge }

interface GlowEdgeData extends Record<string, unknown> {
  color: string
  dash: boolean
}

function edgeColor(from: Task | undefined, to: Task | undefined): string {
  if (!from || !to) return '#000000'
  if (from.overdue || to.overdue) return '#ff6b6b'
  return '#000000'
}

function edgeDash(from: Task | undefined, to: Task | undefined): boolean {
  return !!from && !!to && from.state === 'done' && to.state === 'done'
}

function GlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const deleteEdge = useStore((s) => s.deleteEdge)
  const glow = data as GlowEdgeData | undefined
  const color = glow?.color ?? '#000000'
  const dash = glow?.dash ?? false
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: selected ? 4 : 2.5,
          strokeDasharray: dash ? '3 7' : undefined,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            title="Sever dependency"
            className="nodrag nopan pointer-events-auto absolute z-10 flex size-6 -rotate-3 items-center justify-center border-2 border-black bg-destructive text-sm font-black leading-none text-black neo-shadow-sm transition-transform hover:rotate-0"
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            onClick={() => {
              const [, dependent, prerequisite] = id.split('-')
              void deleteEdge(Number(dependent), Number(prerequisite))
            }}
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const COACH_STEPS = [
  'The LEFT column is what you can start right now — top card is your best move.',
  'Hover a quest for actions: ✓ done · ✎ open · 🔗 link it to another quest.',
  'Finish something and watch quests unlock outward. Shift+drag box-selects.',
]

function CoachMarks({
  step,
  onNext,
  onClose,
}: {
  step: number
  onNext: () => void
  onClose: () => void
}) {
  const last = step >= COACH_STEPS.length - 1
  return (
    <div className="absolute bottom-24 left-1/2 z-30 w-[300px] rotate-1 border-4 border-black bg-secondary p-4 neo-shadow-lg">
      <p className="text-[10px] font-black uppercase tracking-widest">
        Quick tip {step + 1}/3
      </p>
      <p className="mt-1.5 text-sm font-bold leading-snug">{COACH_STEPS[step]}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Skip
        </Button>
        {!last && (
          <Button size="sm" onClick={onNext}>
            Next
          </Button>
        )}
        {last && (
          <Button size="sm" onClick={onClose}>
            Got it
          </Button>
        )}
      </div>
    </div>
  )
}

function FilterBar({
  ranked,
  setRanked,
  legendOpen,
  toggleLegend,
}: {
  ranked: boolean
  setRanked: (v: boolean) => void
  legendOpen: boolean
  toggleLegend: () => void
}) {
  const setView = useStore((s) => s.setView)
  const projects = useStore((s) => s.payload?.projects) ?? NO_PROJECTS
  const hidden = useStore((s) => s.hiddenProjects)
  const toggleProject = useStore((s) => s.toggleProject)
  const dir = useStore((s) => s.dir)
  const setDir = useStore((s) => s.setDir)
  const freshCount = useStore((s) => s.freshIds.length)
  const freshOnly = useStore((s) => s.freshOnly)
  const toggleFreshOnly = useStore((s) => s.toggleFreshOnly)

  return (
    <div className="absolute left-3 top-3 z-10 flex max-w-[250px] flex-col gap-2 border-4 border-black bg-white p-3 neo-shadow-md">
      <div className="flex items-center justify-between border-b-4 border-black pb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest">
          <Layers className="size-4 stroke-[3]" /> Realms
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => setView('list')} title="Switch to list view (L)">
            <ListTodo className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-xs"
            onClick={() => setDir(dir === 'LR' ? 'TB' : 'LR')}
            title={`Layout flow: ${dir === 'LR' ? 'left to right' : 'top to bottom'} (click to flip)`}
          >
            {dir === 'LR' ? '→ flow' : '↓ flow'}
          </Button>
        </div>
      </div>

      <button
        onClick={() => setRanked(!ranked)}
        title="Frontier view orders columns by readiness — leftmost is what you can start now"
        className={cn(
          'flex items-center justify-center border-2 border-black px-2 py-1 text-[11px] font-black uppercase tracking-widest transition-colors',
          ranked ? 'bg-secondary neo-shadow-sm' : 'bg-white hover:bg-muted',
        )}
      >
        {ranked ? '★ Frontier view' : 'Free view'}
      </button>

      {freshCount > 0 && (
        <button
          onClick={() => toggleFreshOnly()}
          className={cn(
            'flex items-center justify-center gap-1.5 border-2 border-black px-2 py-1 text-[11px] font-black uppercase tracking-widest transition-colors',
            freshOnly ? 'bg-secondary neo-shadow-sm' : 'bg-white hover:bg-muted',
          )}
        >
          ✨ Just imported ({freshCount})
        </button>
      )}

      {projects.length === 0 && (
        <span className="text-xs font-bold">No projects yet</span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {projects.map((p) => {
          const off = hidden.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => toggleProject(p.id)}
              title={off ? `Show ${p.name}` : `Hide ${p.name}`}
              className={cn(
                'flex items-center gap-1.5 border-2 border-black px-2 py-0.5 text-[11px] font-bold transition-all',
                off && 'line-through opacity-40',
              )}
              style={{ background: p.color }}
            >
              {p.name}
            </button>
          )
        })}
      </div>

      <div className="mt-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t-4 border-black pt-2 text-[10px] font-bold uppercase tracking-wide">
        {(['available', 'in_progress', 'locked', 'done'] as const).map((state) => (
          <span key={state} className="flex items-center gap-1">
            <span className="size-2.5 border border-black" style={{ background: STATE_COLORS[state] }} />
            {STATE_BADGE[state].label}
          </span>
        ))}
      </div>

      {legendOpen && (
        <div className="space-y-1.5 border-t-4 border-black pt-2 text-[11px] font-bold leading-snug">
          {ranked ? (
            <p>
              Columns = readiness. <b>Left column is NOW</b>; each step right unlocks later.
            </p>
          ) : (
            <p>Free layout — drag nodes anywhere. Switch to Frontier view for ranked columns.</p>
          )}
          <p>Arrow = blocks. Dashed arrow = between finished quests.</p>
          <p className="flex items-center gap-1">
            <Star className="size-3.5 fill-secondary stroke-[2.5]" /> Gold star = your next move.
          </p>
        </div>
      )}

      <button
        onClick={toggleLegend}
        className="border-t-4 border-black pt-2 text-left text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100"
      >
        {legendOpen ? 'Hide how-to-read' : 'How to read this'}
      </button>
    </div>
  )
}

function LinkBanner({ sourceTitle }: { sourceTitle: string }) {
  const setLinkSource = useStore((s) => s.setLinkSource)
  return (
    <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 -rotate-1 items-center gap-3 border-4 border-black bg-secondary px-4 py-2 neo-shadow-md">
      <Link2 className="size-5 shrink-0 stroke-[3]" />
      <p className="text-sm font-bold">
        LINKING FROM <span className="font-black underline">{sourceTitle}</span> — click the quest
        that depends on it
      </p>
      <kbd className="border-2 border-black bg-white px-1.5 py-0.5 text-[10px] font-black">ESC</kbd>
      <button
        onClick={() => setLinkSource(null)}
        title="Cancel linking"
        className="border-2 border-black bg-white p-0.5 neo-push"
      >
        <X className="size-4" strokeWidth={3} />
      </button>
    </div>
  )
}

export function GraphView() {
  const payload = useStore((s) => s.payload)
  const dir = useStore((s) => s.dir)
  const hidden = useStore((s) => s.hiddenProjects)
  const linkSource = useStore((s) => s.linkSource)
  const connect = useStore((s) => s.connect)
  const deleteEdge = useStore((s) => s.deleteEdge)
  const setDetails = useStore((s) => s.setDetails)
  const setCreating = useStore((s) => s.setCreating)
  const setLinkSource = useStore((s) => s.setLinkSource)
  const setView = useStore((s) => s.setView)
  const freshIds = useStore((s) => s.freshIds)
  const freshOnly = useStore((s) => s.freshOnly)
  const deleteTasks = useStore((s) => s.deleteTasks)

  const [ranked, setRanked] = useState(true)
  const [legendOpen, setLegendOpen] = useState(
    () => localStorage.getItem('tasker.legend.open') !== '0',
  )
  const [coachStep, setCoachStep] = useState(() =>
    localStorage.getItem('tasker.coach.done') === '1' ? -1 : 0,
  )
  const [confirmSelectionOpen, setConfirmSelectionOpen] = useState(false)

  const posOverrides = useRef(new Map<string, { x: number; y: number }>())

  useEffect(() => {
    if (ranked) posOverrides.current.clear()
  }, [ranked])

  function toggleLegend() {
    const next = !legendOpen
    localStorage.setItem('tasker.legend.open', next ? '1' : '0')
    setLegendOpen(next)
  }
  function finishCoach() {
    localStorage.setItem('tasker.coach.done', '1')
    setCoachStep(-1)
  }

  const allEdges = payload?.edges ?? []
  const tasks = payload?.tasks ?? []

  const laidNodes = useMemo(() => {
    const visible = tasks.filter(
      (t) =>
        (!freshOnly || freshIds.includes(t.id)) &&
        (t.project_id == null || !hidden.includes(t.project_id)),
    )
    const visibleIds = new Set(visible.map((t) => t.id))

    const initial = visible.map<RfNode<TaskNodeData>>((t) => ({
      id: String(t.id),
      type: 'taskNode',
      position: { x: 0, y: 0 },
      deletable: false,
      data: { taskId: t.id, dir, compact: visible.length > 12 },
    }))
    const rfE = allEdges
      .filter((e) => visibleIds.has(e.task_id) && visibleIds.has(e.depends_on_task_id))
      .map(
        (e): RfEdge => ({
          id: `dep-${e.task_id}-${e.depends_on_task_id}`,
          source: String(e.depends_on_task_id),
          target: String(e.task_id),
          type: 'glow',
          data: {
            color: edgeColor(
              tasks.find((t) => t.id === e.depends_on_task_id),
              tasks.find((t) => t.id === e.task_id),
            ),
            dash: edgeDash(
              tasks.find((t) => t.id === e.depends_on_task_id),
              tasks.find((t) => t.id === e.task_id),
            ),
          },
        }),
      )

    let placed: RfNode<TaskNodeData>[]
    if (ranked) {
      const { positions, tierTags } = rankedLayout(visible, rfE)
      placed = initial.map((n) => {
        const saved = posOverrides.current.get(n.id)
        const rankedPos = positions.get(n.id) ?? { x: 0, y: 0 }
        return {
          ...n,
          position: saved ?? rankedPos,
          data: { ...n.data, tierTag: tierTags.get(n.id) },
        }
      })
    } else {
      placed = layoutGraph(initial as RfNode<TaskNodeData>[], rfE, dir).map((n) => {
        const saved = posOverrides.current.get(n.id)
        return saved ? { ...n, position: saved } : n
      })
    }
    return placed
  }, [tasks, allEdges, dir, hidden, freshOnly, freshIds, ranked])

  const rfEdges = useMemo(() => {
    const visibleIds = new Set(
      tasks.filter((t) => t.project_id == null || !hidden.includes(t.project_id)).map((t) => t.id),
    )
    return allEdges
      .filter((e) => visibleIds.has(e.task_id) && visibleIds.has(e.depends_on_task_id))
      .map(
        (e): RfEdge => ({
          id: `dep-${e.task_id}-${e.depends_on_task_id}`,
          source: String(e.depends_on_task_id),
          target: String(e.task_id),
          type: 'glow',
          data: {
            color: edgeColor(
              tasks.find((t) => t.id === e.depends_on_task_id),
              tasks.find((t) => t.id === e.task_id),
            ),
            dash: edgeDash(
              tasks.find((t) => t.id === e.depends_on_task_id),
              tasks.find((t) => t.id === e.task_id),
            ),
          },
        }),
      )
  }, [tasks, allEdges, hidden])

  const [nodes, setNodes, onNodesChange] = useNodesState<RfNode<TaskNodeData>>([])

  useEffect(() => {
    setNodes(laidNodes)
  }, [laidNodes, setNodes])

  const selectedIds = useMemo(
    () => nodes.filter((n) => n.selected).map((n) => Number(n.id)),
    [nodes],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || selectedIds.length === 0) return
      const el = document.activeElement
      if (
        el &&
        (['input', 'textarea', 'select'].includes(el.tagName.toLowerCase()) ||
          (el instanceof HTMLElement && el.isContentEditable))
      )
        return
      e.preventDefault()
      setConfirmSelectionOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds])

  async function confirmDeleteSelection() {
    await deleteTasks(selectedIds)
    setNodes((nds) => nds.filter((n) => !selectedIds.includes(Number(n.id))))
  }

  function handleConnect(conn: Connection) {
    if (conn.source && conn.target && conn.source !== conn.target) {
      void connect(Number(conn.source), Number(conn.target))
    }
  }

  function handleEdgesChange(changes: EdgeChange<RfEdge>[]) {
    for (const change of changes) {
      if (change.type === 'remove') {
        const [, dependent, prerequisite] = change.id.split('-')
        void deleteEdge(Number(dependent), Number(prerequisite))
      }
    }
  }

  function openNode(nodeId: number) {
    if (linkSource !== null) {
      if (nodeId === linkSource) {
        setLinkSource(null)
        return
      }
      if (!wouldCycle(allEdges, nodeId, linkSource)) {
        void connect(linkSource, nodeId)
      }
      return
    }
    setDetails(nodeId)
  }

  function handleNodeDragStop(
    _event: unknown,
    _node: RfNode<TaskNodeData>,
    draggedNodes: RfNode<TaskNodeData>[],
  ) {
    for (const n of draggedNodes) {
      posOverrides.current.set(n.id, n.position)
    }
  }

  const sourceTitle =
    linkSource !== null ? (tasks.find((t) => t.id === linkSource)?.title ?? '') : ''
  const isEmpty = tasks.length === 0

  return (
    <div className="absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => openNode(Number(node.id))}
        onNodeDragStop={handleNodeDragStop}
        panOnDrag
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Meta', 'Control']}
        panActivationKeyCode="Space"
        onEdgesChange={handleEdgesChange}
        isValidConnection={(conn) =>
          conn.source != null &&
          conn.target != null &&
          conn.source !== conn.target &&
          !wouldCycle(allEdges, Number(conn.target), Number(conn.source))
        }
        connectionLineStyle={{
          stroke: '#000000',
          strokeWidth: 3,
          strokeDasharray: '8 8',
        }}
        defaultEdgeOptions={{ type: 'glow' }}
        deleteKeyCode={['Delete', 'Backspace']}
        minZoom={0.15}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.35 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="#d8d0ba" />
        <Controls
          showInteractive={false}
          className="!overflow-hidden !border-[3px] !border-black !bg-white [&>button]:!border-b-2 [&>button]:!border-black [&>button]:!bg-white hover:[&>button]:!bg-secondary"
        />
        <MiniMap
          position="top-right"
          pannable
          zoomable
          className="!hidden md:!block !border-[3px] !border-black !bg-white neo-shadow-sm"
          maskColor="rgba(255, 253, 245, 0.75)"
          nodeColor={(n) => {
            const t = tasks.find((tk) => tk.id === Number(n.id))
            return t ? STATE_COLORS[t.state] : '#fff'
          }}
        />
      </ReactFlow>

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 border-4 border-black bg-white p-1 neo-shadow-md">
        <span className="hidden px-2 text-[10px] font-black uppercase tracking-widest sm:inline">
          Shift+drag = select
        </span>

        <span className="mx-0.5 h-7 w-[3px] bg-black" />

        {selectedIds.length > 0 && (
          <span className="px-1 text-xs font-black uppercase tabular-nums">
            {selectedIds.length} picked
          </span>
        )}
        <Button
          variant={selectedIds.length > 0 ? 'destructive' : 'ghost'}
          size="sm"
          className="h-9"
          disabled={selectedIds.length === 0}
          title={selectedIds.length > 0 ? `Delete ${selectedIds.length} quest(s) (Del)` : 'Select quests first'}
          onClick={() => setConfirmSelectionOpen(true)}
        >
          <Trash2 /> Del{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSelectionOpen}
        onClose={() => setConfirmSelectionOpen(false)}
        destructive
        confirmLabel={`Delete ${selectedIds.length} quest(s)`}
        title={
          selectedIds.length === 1
            ? `Delete "${tasks.find((t) => t.id === selectedIds[0])?.title ?? 'quest'}"?`
            : `Delete ${selectedIds.length} quests?`
        }
        description={
          selectedIds.length > 0
            ? `${tasks
                .filter((t) => selectedIds.includes(t.id))
                .slice(0, 4)
                .map((t) => t.title)
                .join(', ')
                .concat(selectedIds.length > 4 ? ', …' : '')}. Their dependency links will be severed — dependents may unlock.`
            : ''
        }
        onConfirm={() => confirmDeleteSelection()}
      />

      <FilterBar
        ranked={ranked}
        setRanked={setRanked}
        legendOpen={legendOpen}
        toggleLegend={toggleLegend}
      />
      {linkSource !== null && <LinkBanner sourceTitle={sourceTitle} />}

      {coachStep >= 0 && !isEmpty && (
        <CoachMarks
          step={coachStep}
          onNext={() => setCoachStep((s) => s + 1)}
          onClose={finishCoach}
        />
      )}

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto relative rotate-1 border-4 border-black bg-white p-8 text-center neo-shadow-lg">
            <Star className="absolute -left-5 -top-5 size-12 fill-secondary stroke-black stroke-[2.5] animate-spin-slow" />
            <h2 className="text-3xl font-black uppercase tracking-tighter">Your tree awaits</h2>
            <p className="mx-auto mt-3 max-w-xs text-base font-bold leading-snug">
              Forge quests, link dependencies, complete for XP. The graph is your progress.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => setCreating(true)}>
                <Plus /> Forge first quest
              </Button>
              <Button variant="outline" onClick={() => setView('list')}>
                <ListTodo /> List view
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
