import { FolderKanban, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useStore } from '@/store'
import type { Project } from '@/types'

const NO_PROJECTS: Project[] = []

function ProjectRow({ projectId }: { projectId: number }) {
  const project = useStore((s) => s.payload?.projects.find((p) => p.id === projectId))
  const taskCount = useStore(
    (s) => s.payload?.tasks.filter((t) => t.project_id === projectId).length ?? 0,
  )
  const saveProject = useStore((s) => s.saveProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState(project?.color ?? '#38bdf8')
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!project) return null
  const dirty = name !== project.name || color !== project.color

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
        aria-label={`${project.name} color`}
      />
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {taskCount} task{taskCount === 1 ? '' : 's'}
      </span>
      {dirty && (
        <Button size="sm" variant="secondary" onClick={() => saveProject(name.trim(), color, project.id)}>
          Save
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        destructive
        confirmLabel="Disband project"
        title={`Delete "${project.name}"?`}
        description={`${taskCount} task(s) will become unassigned. The tasks themselves are not deleted.`}
        onConfirm={() => deleteProject(project.id)}
      />
    </div>
  )
}

export function ProjectDialog() {
  const open = useStore((s) => s.projectsOpen)
  const setOpen = useStore((s) => s.setProjectsOpen)
  const projects = useStore((s) => s.payload?.projects) ?? NO_PROJECTS
  const saveProject = useStore((s) => s.saveProject)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#a78bfa')

  async function handleAdd() {
    if (name.trim() === '') return
    await saveProject(name.trim(), color)
    setName('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="size-4 text-accent" /> Projects
          </DialogTitle>
          <DialogDescription>
            Projects group tasks and color-code them across the graph.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {projects.map((p) => (
            <ProjectRow key={p.id} projectId={p.id} />
          ))}
        </div>

        <Separator />

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleAdd()
          }}
        >
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-1"
            aria-label="New project color"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name…"
          />
          <Button type="submit" disabled={name.trim() === ''}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
