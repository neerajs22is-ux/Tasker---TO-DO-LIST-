export type TaskStatus = 'pending' | 'in_progress' | 'done'
export type TaskState = 'locked' | 'available' | 'in_progress' | 'done'

export interface Project {
  id: number
  name: string
  color: string
  created_at: string
}

export interface Task {
  id: number
  project_id: number | null
  title: string
  description: string | null
  duration_estimate: number | null
  importance: number
  deadline: string | null
  status: TaskStatus
  completed_at: string | null
  state: TaskState
  overdue: boolean
  blocking_count: number
  priority_score: number | null
}

export interface ActivityEntry {
  type: string
  xp_delta: number
  detail: string | null
  at: string
}

export type ConfidenceField = 'duration' | 'priority' | 'dependencies' | 'scope'

export interface DraftTask {
  id: number
  title: string
  description: string | null
  duration_estimate: number | null
  importance: number
  project_id: number | null
  confidence: Record<ConfidenceField, number>
  belowThreshold: Partial<Record<ConfidenceField, number>>
  guessed: boolean
  resolvedDependencyIds: number[]
  unresolvedReferences: string[]
  duplicates: { task_id: number; title: string; score: number }[]
  suggestions: {
    prerequisite_id: number
    prerequisite_title: string
    because_completed: string
    score: number
  }[]
}

export interface InterviewQuestion {
  id: string
  taskId: string
  field: ConfidenceField
  question: string
  kind: 'duration' | 'choice' | 'text'
  options?: string[]
}

export interface DepCandidate {
  dependentId: number
  prerequisiteId: number
  dependentTitle: string
  prerequisiteTitle: string
  reason: string
  accepted: boolean
}

export type ImportPhase = 'discovery' | 'mechanical' | 'done'

export interface ImportBatch {
  id: number
  sourceType: 'text' | 'markdown' | 'pdf'
  status: 'extracting' | 'awaiting_interview' | 'confirmed' | 'discarded'
  createdAt: string
  failedChunks: number
  extractionErrors?: string[]
  skippedAll: boolean
  phase: ImportPhase
  questions: InterviewQuestion[]
  depCandidates: DepCandidate[]
  drafts: DraftTask[]
}

export interface AnswerPayload {
  questionId: string
  value: string | string[] | number
}

export interface Edge {
  task_id: number
  depends_on_task_id: number
}

export interface GameState {
  xp: number
  level: number
  streak_count: number
  longest_streak: number
  last_activity_date: string | null
  streak_freezes_available: number
  momentum_score: number
  currency_balance: number
  xp_into_level: number
  xp_for_next_level: number
  profile_name: string
  profile_color: string
}

export interface GraphPayload {
  projects: Project[]
  tasks: Task[]
  edges: Edge[]
  game_state: GameState
}

export interface CompleteResult {
  awarded_xp: number
  total_xp: number
  level: number
  leveled_up: boolean
  streak_count: number
}

export interface CycleErrorBody {
  message: string
  cycle: string[]
}

export interface TaskInput {
  title: string
  description: string | null
  duration_estimate: number | null
  importance: number
  deadline: string | null
  project_id: number | null
}
