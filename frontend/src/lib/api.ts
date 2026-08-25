import type {
  CompleteResult,
  CycleErrorBody,
  Edge,
  GraphPayload,
  Project,
  Task,
  TaskInput,
} from '@/types'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(errorText(status, body))
    this.status = status
    this.body = body
  }

  cycle(): string[] | null {
    if (
      this.status === 409 &&
      this.body &&
      typeof this.body === 'object' &&
      'cycle' in this.body
    ) {
      return (this.body as CycleErrorBody).cycle
    }
    return null
  }
}

function errorText(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    if ('detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
      if (detail && typeof detail === 'object' && 'message' in detail) {
        return String((detail as { message: unknown }).message)
      }
      if (Array.isArray(detail)) {
        const first = detail[0] as { msg?: string } | undefined
        return first?.msg ?? `Request failed (${status})`
      }
      return JSON.stringify(detail)
    }
  }
  return `Request failed (${status})`
}

export function ApiErrorText(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function getGraph() {
  return request<GraphPayload>('/graph')
}

export function ingestText(text: string) {
  return request<IngestResponse>('/ingest/text', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

async function uploadFile(kind: 'markdown' | 'pdf', file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/ingest/${kind}`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<IngestResponse>
}

export function ingestMarkdown(file: File) {
  return uploadFile('markdown', file)
}

export function ingestPdf(file: File) {
  return uploadFile('pdf', file)
}

export interface IngestResponse {
  batch: import('@/types').ImportBatch
  reused: boolean
  created: number
  edges: number
}

export function getBatch(batchId: number) {
  return request<import('@/types').ImportBatch>(`/import-batches/${batchId}`)
}

export function answerBatch(
  batchId: number,
  answers: import('@/types').AnswerPayload[],
) {
  return request<{
    applied: number
    splitsCreated: number
    tasksAdded: number
    dependenciesAdded: number
    moreQuestions: boolean
    batch: import('@/types').ImportBatch
  }>(`/import-batches/${batchId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  })
}

export function skipInterview(batchId: number) {
  return request<{ batch: import('@/types').ImportBatch }>(
    `/import-batches/${batchId}/skip-interview`,
    { method: 'POST' },
  )
}

export interface ConfirmResult {
  confirmed: number
  edges_created: { dependent_title: string; prerequisite_title: string }[]
  edges_rejected: {
    dependent_title: string
    prerequisite_title: string
    cycle: string[]
  }[]
  remaining_drafts: boolean
  batch: import('@/types').ImportBatch
}

export function confirmBatch(
  batchId: number,
  payload: {
    taskIds?: number[]
    acceptedDependencies?: { taskId: number; prerequisiteId: number }[]
    acceptedSuggestions?: { taskId: number; prerequisiteId: number }[]
  } = {},
) {
  return request<ConfirmResult>(`/import-batches/${batchId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function discardBatch(batchId: number) {
  return request<{ status: string }>(`/import-batches/${batchId}`, {
    method: 'DELETE',
  })
}

export interface SimilarResponse {
  duplicates: { task_id: number; title: string; score: number }[]
  suggestions: {
    prerequisite_id: number
    prerequisite_title: string
    because_completed: string
    score: number
  }[]
}

export function getSimilar(taskId: number) {
  return request<SimilarResponse>(`/tasks/${taskId}/similar`)
}

export function logProgress(taskId: number, note: string) {
  return request<{ id: number; at: string; detail: string }>(`/tasks/${taskId}/log`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export function getActivity(taskId: number) {
  return request<import('@/types').ActivityEntry[]>(`/tasks/${taskId}/activity`)
}

export function updateProfile(name: string, color: string) {
  return request<import('@/types').GameState>('/game-state/profile', {
    method: 'PATCH',
    body: JSON.stringify({ name, color }),
  })
}

export function resetGame(
  scope: 'stats' | 'tasks' | 'all',
): Promise<{ reset: string; quests_deleted: number; logs_deleted: number }> {
  return request(`/game-state/reset/${scope}`, { method: 'POST' })
}

export function createTask(data: TaskInput) {
  return request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTask(id: number, data: Partial<TaskInput> & { status?: string }) {
  return request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteTask(id: number) {
  return request<{ id: number; removed_dependencies: number }>(`/tasks/${id}`, {
    method: 'DELETE',
  })
}

export function completeTask(id: number) {
  return request<CompleteResult>(`/tasks/${id}/complete`, { method: 'POST' })
}

export function reopenTask(id: number) {
  return request<Task>(`/tasks/${id}/reopen`, { method: 'POST' })
}

export function createEdge(taskId: number, dependsOnId: number) {
  return request<Edge>('/dependencies', {
    method: 'POST',
    body: JSON.stringify({ task_id: taskId, depends_on_task_id: dependsOnId }),
  })
}

export function deleteEdge(taskId: number, dependsOnId: number) {
  return request<void>(`/dependencies/${taskId}/${dependsOnId}`, { method: 'DELETE' })
}

export function createProject(name: string, color: string) {
  return request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  })
}

export function updateProject(id: number, name: string, color: string) {
  return request<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, color }),
  })
}

export function deleteProject(id: number) {
  return request<{ id: number }>(`/projects/${id}`, { method: 'DELETE' })
}
