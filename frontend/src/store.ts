import { toast } from 'sonner'
import { create } from 'zustand'

import * as api from '@/lib/api'
import type { AnswerPayload, GraphPayload, ImportBatch, TaskInput } from '@/types'

export type ViewMode = 'home' | 'capture' | 'nextup' | 'board' | 'graph' | 'list' | 'review'
export type WipeVariant = 'iris' | 'wipeLeft' | 'wipeUp' | 'doorH'

const WIPE_LABELS: Record<ViewMode, string> = {
  home: 'HOME',
  capture: 'CAPTURE',
  nextup: 'NEXT UP',
  board: 'BOARD',
  graph: 'GRAPH',
  list: 'LIST',
  review: 'REVIEW',
}

let wipeTimerA: ReturnType<typeof setTimeout> | null = null
let lastVariant: WipeVariant | null = null
export type CaptureStep =
  | 'source'
  | 'input'
  | 'extracting'
  | 'interview'
  | 'review'
  | 'failed'
  | 'forged'
export type LayoutDir = 'LR' | 'TB'

export interface Burst {
  id: number
  x: number
  y: number
  xp: number
}

let burstSeq = 1

interface Store {
  payload: GraphPayload | null
  loading: boolean
  error: string | null
  view: ViewMode
  dir: LayoutDir
  hiddenProjects: number[]
  detailsTaskId: number | null
  creating: boolean
  projectsOpen: boolean
  profileOpen: boolean
  transition: { variant: WipeVariant; phase: 'cover' | 'reveal'; label: string } | null
  bursts: Burst[]
  lastLevel: number
  unlockedIds: number[]
  linkSource: number | null
  batch: ImportBatch | null
  importing: boolean
  captureStep: CaptureStep
  captureSource: 'text' | 'markdown' | 'pdf' | null
  freshIds: number[]
  freshOnly: boolean

  load: () => Promise<void>
  setView: (view: ViewMode) => void
  setDir: (dir: LayoutDir) => void
  toggleProject: (id: number) => void
  setCreating: (open: boolean) => void
  setDetails: (taskId: number | null) => void
  setProjectsOpen: (open: boolean) => void
  setProfileOpen: (open: boolean) => void
  setLinkSource: (taskId: number | null) => void
  enterApp: () => void
  updateProfile: (name: string, color: string) => Promise<void>
  resetGame: (scope: 'stats' | 'tasks' | 'all') => Promise<void>
  setCaptureStep: (step: CaptureStep) => void
  setCaptureSource: (source: 'text' | 'markdown' | 'pdf' | null) => void
  toggleFreshOnly: () => void
  clearFresh: () => void
  startImport: (source: 'text' | 'markdown' | 'pdf', payload: string | File) => Promise<void>
  answerBatch: (answers: AnswerPayload[]) => Promise<void>
  skipInterviewBatch: () => Promise<void>
  confirmImport: (
    acceptedDependencies: { taskId: number; prerequisiteId: number }[],
    acceptedSuggestions: { taskId: number; prerequisiteId: number }[],
  ) => Promise<void>
  discardImport: () => Promise<void>

  saveTask: (data: TaskInput, taskId?: number) => Promise<boolean>
  completeTask: (taskId: number, x: number, y: number) => Promise<void>
  reopenTask: (taskId: number) => Promise<void>
  startPauseTask: (taskId: number, start: boolean) => Promise<void>
  deleteTask: (taskId: number) => Promise<void>
  deleteTasks: (taskIds: number[]) => Promise<void>

  connect: (prerequisiteId: number, dependentId: number) => Promise<void>
  deleteEdge: (dependentId: number, prerequisiteId: number) => Promise<void>

  saveProject: (name: string, color: string, projectId?: number) => Promise<void>
  deleteProject: (projectId: number) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  payload: null,
  loading: true,
  error: null,
  view: 'home',
  dir: 'LR',
  hiddenProjects: [],
  detailsTaskId: null,
  creating: false,
  projectsOpen: false,
  profileOpen: false,
  transition: null,
  bursts: [],
  lastLevel: 1,
  unlockedIds: [],
  linkSource: null,
  batch: null,
  importing: false,
  captureStep: 'source',
  captureSource: null,
  freshIds: [],
  freshOnly: false,

  async startImport(source, payload) {
    set({ importing: true, captureStep: 'extracting' })
    try {
      const result =
        source === 'text'
          ? await api.ingestText(payload as string)
          : source === 'markdown'
            ? await api.ingestMarkdown(payload as File)
            : await api.ingestPdf(payload as File)

      if (result.reused) {
        await get().load()
        set({ importing: false, batch: null, captureStep: 'source', view: 'graph' })
        toast.success(`Reused your previous graph — ${result.created} quests restored`, {
          description: `${result.edges} dependency link(s) came along.`,
        })
        return
      }

      const step =
        result.batch.drafts.length === 0
          ? 'failed'
          : result.batch.questions.length > 0
            ? 'interview'
            : 'review'
      set({ batch: result.batch, importing: false, captureStep: step })
      if (result.batch.drafts.length > 0) {
        toast.success(`Extracted ${result.batch.drafts.length} draft quest(s)`)
      }
      if (result.batch.failedChunks > 0) {
        toast.warning(`${result.batch.failedChunks} section(s) could not be parsed`, {
          description: result.batch.extractionErrors?.[0] ?? 'They were skipped.',
        })
      }
    } catch (err) {
      set({ importing: false, captureStep: 'input' })
      toast.error(api.ApiErrorText(err))
    }
  },

  async answerBatch(answers) {
    const batch = get().batch
    if (!batch) return
    try {
      const result = await api.answerBatch(batch.id, answers)
      set({ batch: result.batch })
      if (result.splitsCreated > 0) {
        toast(`Split into ${result.splitsCreated} quests`, {
          description: 'The original draft was replaced.',
        })
      }
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async skipInterviewBatch() {
    const batch = get().batch
    if (!batch) return
    try {
      const result = await api.skipInterview(batch.id)
      set({ batch: result.batch })
      toast('Low-confidence fields filled with best guesses')
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async confirmImport(acceptedDependencies, acceptedSuggestions) {
    const batch = get().batch
    if (!batch) return
    try {
      const result = await api.confirmBatch(batch.id, {
        acceptedDependencies,
        acceptedSuggestions,
      })
      await get().load()
      const freshIds = batch.drafts.map((d) => d.id)
      set({
        batch: result.remaining_drafts ? result.batch : null,
        freshIds,
        freshOnly: false,
        linkSource: null,
      })
      toast.success(`${result.confirmed} quest(s) added to your tree`, {
        description:
          result.edges_created.length > 0
            ? `${result.edges_created.length} dependency link(s) forged`
            : undefined,
      })
      for (const rejected of result.edges_rejected) {
        toast.warning('Dependency cycle rejected', {
          description: `${rejected.cycle.join('  →  ')}`,
          duration: 9000,
        })
      }
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async discardImport() {
    const batch = get().batch
    if (!batch) return
    try {
      await api.discardBatch(batch.id)
      set({ batch: null, freshIds: [] })
      await get().load()
      toast('Import discarded')
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async load() {
    try {
      const payload = await api.getGraph()
      set({ payload, error: null, loading: false, lastLevel: payload.game_state.level })
    } catch (err) {
      set({ error: api.ApiErrorText(err), loading: false })
    }
  },

  setView(view) {
    if (get().view === view || get().transition) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set({ view })
      return
    }
    const variants: WipeVariant[] = ['iris', 'wipeLeft', 'wipeUp', 'doorH']
    const pool = variants.filter((v) => v !== lastVariant)
    const variant = pool[Math.floor(Math.random() * pool.length)]
    lastVariant = variant

    set({ transition: { variant, phase: 'cover', label: WIPE_LABELS[view] } })
    if (wipeTimerA) clearTimeout(wipeTimerA)
    wipeTimerA = setTimeout(() => {
      set({ view, transition: { variant, phase: 'reveal', label: WIPE_LABELS[view] } })
      wipeTimerA = setTimeout(() => set({ transition: null }), 340)
    }, 300)
  },
  setDir(dir) {
    set({ dir })
  },
  toggleProject(id) {
    const hidden = get().hiddenProjects
    set({
      hiddenProjects: hidden.includes(id)
        ? hidden.filter((p) => p !== id)
        : [...hidden, id],
    })
  },
  setCreating(open) {
    set({ creating: open })
  },
  setDetails(taskId) {
    set({ detailsTaskId: taskId })
  },
  setProjectsOpen(open) {
    set({ projectsOpen: open })
  },
  setProfileOpen(open) {
    set({ profileOpen: open })
  },
  setLinkSource(taskId) {
    set({ linkSource: taskId })
  },
  enterApp() {
    const hasQuests = (get().payload?.tasks.length ?? 0) > 0
    set({ view: hasQuests ? 'nextup' : 'capture' })
  },
  async updateProfile(name, color) {
    try {
      await api.updateProfile(name, color)
      await get().load()
      toast.success('Profile updated')
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },
  async resetGame(scope) {
    try {
      const result = await api.resetGame(scope)
      set({
        batch: null,
        freshIds: [],
        unlockedIds: [],
        detailsTaskId: null,
        linkSource: null,
        view: scope === 'stats' ? get().view : 'nextup',
      })
      await get().load()
      if (result.reset !== 'stats') {
        useStore.getState().setCaptureStep('source')
      }
      toast.success(
        result.reset === 'all'
          ? 'Fresh start — everything wiped'
          : result.reset === 'tasks'
            ? `Deleted ${result.quests_deleted} quests`
            : 'Stats reset to zero',
      )
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },
  setCaptureStep(step) {
    set({ captureStep: step })
  },
  setCaptureSource(source) {
    set({ captureSource: source, captureStep: source ? 'input' : 'source' })
  },
  toggleFreshOnly() {
    set({ freshOnly: !get().freshOnly })
  },
  clearFresh() {
    set({ freshIds: [], freshOnly: false })
  },

  async saveTask(data, taskId) {
    try {
      if (taskId === undefined) {
        const created = await api.createTask(data)
        toast.success(`Quest created: ${data.title}`)
        try {
          const similar = await api.getSimilar(created.id)
          if (similar.duplicates.length > 0) {
            toast.warning('Possible duplicate', {
              description: `Looks a lot like "${similar.duplicates[0].title}" (${Math.round(
                similar.duplicates[0].score * 100,
              )}% match)`,
            })
          }
        } catch {
          /* similarity is best-effort */
        }
      } else {
        await api.updateTask(taskId, data)
        toast.success('Changes saved')
      }
      await get().load()
      return true
    } catch (err) {
      toast.error(api.ApiErrorText(err))
      return false
    }
  },

  async completeTask(taskId, x, y) {
    const prevPayload = get().payload
    let unlockCandidates: number[] = []
    if (prevPayload) {
      const completed = prevPayload.tasks.find((t) => t.id === taskId)
      if (completed && completed.state !== 'done') {
        unlockCandidates = prevPayload.edges
          .filter((e) => e.depends_on_task_id === taskId)
          .map((e) => e.task_id)
      }
    }

    const before = get().payload?.game_state.level ?? 1
    try {
      const result = await api.completeTask(taskId)
      await get().load()

      const nowAvailable = (get().payload?.tasks ?? []).filter(
        (t) =>
          unlockCandidates.includes(t.id) &&
          t.state === 'available' &&
          prevPayload?.tasks.find((p) => p.id === t.id)?.state === 'locked',
      )
      const ids = nowAvailable.map((t) => t.id)
      if (ids.length > 0) {
        set({ unlockedIds: ids })
        setTimeout(() => {
          const current = get().unlockedIds
          useStore.setState({
            unlockedIds: current.filter((id) => !ids.includes(id)),
          })
        }, 4500)
      }

      set({
        bursts: [...get().bursts, { id: burstSeq++, x, y, xp: result.awarded_xp }],
        detailsTaskId: get().detailsTaskId === taskId ? null : get().detailsTaskId,
      })
      toast.success(`+${result.awarded_xp} XP — ${result.streak_count} day streak`)
      if (ids.length > 0) {
        setTimeout(() => toast('UNLOCKED', {
          description: `${ids.length} quest(s) just became available`,
        }), 400)
      }
      if (result.leveled_up && result.level > before) {
        setTimeout(() => toast('LEVEL UP', { description: `You reached level ${result.level}` }), 350)
      }
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async reopenTask(taskId) {
    try {
      await api.reopenTask(taskId)
      toast('Quest reopened', { description: 'XP returned to the hoard' })
      await get().load()
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async startPauseTask(taskId, start) {
    try {
      await api.updateTask(taskId, { status: start ? 'in_progress' : 'pending' })
      await get().load()
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async deleteTask(taskId) {
    const task = get().payload?.tasks.find((t) => t.id === taskId)
    try {
      const result = await api.deleteTask(taskId)
      toast(`Removed "${task?.title ?? 'task'}"`, {
        description:
          result.removed_dependencies > 0
            ? `${result.removed_dependencies} dependency link(s) severed`
            : undefined,
      })
      set({ detailsTaskId: get().detailsTaskId === taskId ? null : get().detailsTaskId })
      await get().load()
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async deleteTasks(taskIds) {
    let severed = 0
    for (const id of taskIds) {
      try {
        const result = await api.deleteTask(id)
        severed += result.removed_dependencies
      } catch {
        /* already gone */
      }
    }
    set({
      freshIds: get().freshIds.filter((id) => !taskIds.includes(id)),
      detailsTaskId: get().detailsTaskId !== null && taskIds.includes(get().detailsTaskId!)
        ? null
        : get().detailsTaskId,
    })
    await get().load()
    toast(`Deleted ${taskIds.length} quest(s)`, {
      description: severed > 0 ? `${severed} dependency link(s) severed` : undefined,
    })
  },

  async connect(prerequisiteId, dependentId) {
    try {
      await api.createEdge(dependentId, prerequisiteId)
      toast.success('Dependency forged')
      await get().load()
    } catch (err) {
      if (err instanceof api.ApiError) {
        const cycle = err.cycle()
        if (cycle) {
          toast.error('Cycle rejected', {
            description: cycle.join('  →  '),
            duration: 8000,
          })
          return
        }
      }
      toast.error(api.ApiErrorText(err))
    }
  },

  async deleteEdge(dependentId, prerequisiteId) {
    try {
      await api.deleteEdge(dependentId, prerequisiteId)
      await get().load()
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async saveProject(name, color, projectId) {
    try {
      if (projectId === undefined) {
        await api.createProject(name, color)
        toast.success(`Realm founded: ${name}`)
      } else {
        await api.updateProject(projectId, name, color)
        toast.success('Project updated')
      }
      await get().load()
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },

  async deleteProject(projectId) {
    try {
      await api.deleteProject(projectId)
      set({
        hiddenProjects: get().hiddenProjects.filter((p) => p !== projectId),
      })
      toast('Project disbanded', { description: 'Its tasks are now unassigned' })
      await get().load()
    } catch (err) {
      toast.error(api.ApiErrorText(err))
    }
  },
}))
