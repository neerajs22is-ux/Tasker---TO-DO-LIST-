import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import type { Project, Task, TaskInput } from '@/types'
import { useStore } from '@/store'
import { Flame } from 'lucide-react'

const NO_PROJECTS: Project[] = []

interface TaskFormProps {
  initial?: Task | null
  submitLabel: string
  onSubmit: (data: TaskInput) => Promise<boolean>
}

export function TaskForm({ initial, submitLabel, onSubmit }: TaskFormProps) {
  const projects = useStore((s) => s.payload?.projects) ?? NO_PROJECTS
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [projectId, setProjectId] = useState(
    initial?.project_id != null ? String(initial.project_id) : 'none',
  )
  const [duration, setDuration] = useState(
    initial?.duration_estimate != null ? String(initial.duration_estimate) : '',
  )
  const [importance, setImportance] = useState(initial?.importance ?? 3)
  const [deadline, setDeadline] = useState(initial?.deadline ? initial.deadline.slice(0, 16) : '')
  const [busy, setBusy] = useState(false)

  const valid = title.trim().length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    const ok = await onSubmit({
      title: title.trim(),
      description: description.trim() === '' ? null : description.trim(),
      duration_estimate: duration === '' ? null : Number(duration),
      importance,
      deadline: deadline === '' ? null : deadline,
      project_id: projectId === 'none' ? null : Number(projectId),
    })
    setBusy(false)
    if (ok && initial === undefined) {
      setTitle('')
      setDescription('')
      setDuration('')
      setDeadline('')
      setImportance(3)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Slay the dragon…"
          autoFocus
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="task-desc">Notes</Label>
        <Textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details, links, acceptance criteria…"
          rows={2}
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Project</Label>
        <Select
          value={projectId}
          onValueChange={(v) => {
            if (v === '__new__') {
              setProjectId('none')
              useStore.getState().setProjectsOpen(true)
            } else {
              setProjectId(v)
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="No project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Unassigned —</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
            <SelectItem value="__new__" className="text-violet-300">
              + New project…
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="task-duration">Effort (hours)</Label>
          <Input
            id="task-duration"
            type="number"
            min="0.25"
            step="0.25"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="?"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-deadline">Deadline</Label>
          <Input
            id="task-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="task-importance">
          Importance
          <span className="ml-auto flex items-center gap-0.5 text-amber-400">
            {Array.from({ length: importance }).map((_, i) => (
              <Flame key={i} className="size-3.5" />
            ))}
          </span>
        </Label>
        <Slider
          id="task-importance"
          min={1}
          max={5}
          step={1}
          value={[importance]}
          onValueChange={([v]) => setImportance(v)}
        />
      </div>

      <Button type="submit" disabled={!valid || busy} className="mt-1">
        {busy ? 'Working…' : submitLabel}
      </Button>
    </form>
  )
}
