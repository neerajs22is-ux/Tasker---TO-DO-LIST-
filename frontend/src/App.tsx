import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FolderKanban,
  ListTodo,
  LoaderCircle,
  Network,
  Plus,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'

import { BurstOverlay } from '@/components/BurstOverlay'
import { GameWidget } from '@/components/GameWidget'
import { HelpPopover } from '@/components/HelpPopover'
import { PageWipe } from '@/components/PageWipe'
import { ProjectDialog } from '@/components/ProjectDialog'
import { ProfileDialog } from '@/components/ProfileDialog'
import { TaskDetailsSheet } from '@/components/TaskDetailsSheet'
import { TaskForm } from '@/components/TaskForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { CaptureSpace } from '@/views/CaptureSpace'
import { GraphView } from '@/views/GraphView'
import { Home } from '@/views/Home'
import { ListView } from '@/views/ListView'
import { BoardView } from '@/views/Board'
import { NextUpView } from '@/views/NextUp'

function CreateTaskDialog() {
  const open = useStore((s) => s.creating)
  const setOpen = useStore((s) => s.setCreating)
  const saveTask = useStore((s) => s.saveTask)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>New quest</DialogTitle>
          <DialogDescription>Create a new task</DialogDescription>
        </DialogHeader>
        <h2 className="text-lg font-semibold">New quest</h2>
        <TaskForm submitLabel="Create quest" onSubmit={(data) => saveTask(data)} />
      </DialogContent>
    </Dialog>
  )
}

function isTypingTarget(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return el instanceof HTMLElement && el.isContentEditable
}

export default function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const load = useStore((s) => s.load)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const setCreating = useStore((s) => s.setCreating)
  const setLinkSource = useStore((s) => s.setLinkSource)
  const linkSource = useStore((s) => s.linkSource)
  const batchActive = useStore((s) => s.batch !== null)
  const profileColor = useStore((s) => s.payload?.game_state.profile_color ?? '#FFD93D')
  const profileName = useStore((s) => s.payload?.game_state.profile_name ?? '?')
  const [helpOpen, setHelpOpen] = useState(false)
  const profileInitial = profileName.trim().charAt(0).toUpperCase() || '?'

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && linkSource !== null) {
        setLinkSource(null)
        return
      }
      if (isTypingTarget() || e.ctrlKey || e.metaKey || e.altKey) return
      if (view === 'home' || view === 'capture') return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setView('capture')
        useStore.getState().setCaptureSource(null)
        useStore.getState().setCaptureStep('source')
      } else if (e.key === 'g' || e.key === 'G') {
        setView('graph')
      } else if (e.key === 'l' || e.key === 'L') {
        setView('list')
      } else if (e.key === '?') {
        setHelpOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [linkSource, setCreating, setLinkSource, setView, view])

  if (view === 'home') {
    return (
      <>
        <div className="h-dvh bg-background text-foreground">
          <Home />
        </div>
        <PageWipe />
        <Toaster />
      </>
    )
  }

  if (view === 'capture') {
    return (
      <>
        <div className="h-dvh bg-background text-foreground">
          <CaptureSpace />
        </div>
        <PageWipe />
        <Toaster />
      </>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-20 flex shrink-0 items-center gap-2 border-b-4 border-black bg-background px-3 py-2 sm:gap-3 sm:px-4">
        <button
          onClick={() => setView('home')}
          title="Back to home"
          className="-rotate-1 transition-transform hover:rotate-0"
        >
          <span className="flex items-center border-4 border-black bg-secondary px-2 py-1 neo-shadow-sm">
            <Network className="size-5 stroke-[3]" />
            <span className="ml-1.5 hidden text-base font-black uppercase tracking-[0.12em] sm:inline">
              TASKER
            </span>
          </span>
        </button>

        <button
          onClick={() => useStore.getState().setProfileOpen(true)}
          title="Profile & resets"
          className="flex size-11 items-center justify-center border-4 border-black text-base font-black uppercase neo-shadow-sm transition-transform hover:-translate-y-0.5"
          style={{ background: profileColor }}
        >
          {profileInitial}
        </button>

        <GameWidget />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <nav className="flex border-[3px] border-black bg-white neo-shadow-sm">
            {(['nextup', 'board', 'graph', 'list'] as const).map((v) => {
              const label = v === 'nextup' ? 'Next up' : v
              const Icon =
                v === 'nextup' ? Sparkles : v === 'board' ? ListTodo : v === 'graph' ? Network : ListTodo
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  title={`${label} view`}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors',
                    view === v ? 'bg-secondary' : 'bg-white hover:bg-muted',
                    v !== 'list' && 'border-r-[3px] border-black',
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden lg:inline">{label}</span>
                </button>
              )
            })}
          </nav>

          <Button variant="outline" size="icon" title="Manage projects" onClick={() => useStore.getState().setProjectsOpen(true)}>
            <FolderKanban />
          </Button>
          <HelpPopover open={helpOpen} onOpenChange={setHelpOpen} />
          <Button
            onClick={() => {
              setView('capture')
              useStore.getState().setCaptureSource(null)
              useStore.getState().setCaptureStep('source')
            }}
          >
            <Plus /> Capture
          </Button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {error ? (
          <div className="neo-dots absolute inset-0 flex items-center justify-center p-4">
            <div className="flex max-w-md flex-col items-center gap-4 border-4 border-black bg-card p-8 text-center neo-shadow-lg">
              <TriangleAlert className="size-12 stroke-[2.5] text-destructive" />
              <h2 className="text-2xl font-black uppercase">API DOWN</h2>
              <p className="text-sm font-bold">{error}</p>
              <code className="w-full border-2 border-black bg-background/80 p-3 font-mono text-xs font-bold">
                cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
              </code>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw /> Retry
              </Button>
            </div>
          </div>
        ) : loading ? (
          <div className="neo-grid absolute inset-0 flex items-center justify-center">
            <LoaderCircle className="size-12 animate-spin stroke-[2.5]" />
          </div>
        ) : (
          <>
            {view === 'nextup' && <NextUpView />}
            {view === 'board' && <BoardView />}
            {view === 'graph' && <GraphView />}
            {(view === 'list' || view === 'review') && <ListView />}
          </>
        )}
      </main>

      {batchActive && (
        <AnimatePresence>
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setView('capture')}
            className="fixed bottom-20 right-4 z-40 flex -rotate-2 items-center gap-2 border-4 border-black bg-secondary px-4 py-2 text-xs font-black uppercase tracking-widest neo-shadow-md transition-transform hover:rotate-0 hover:-translate-y-1"
          >
            <Sparkles className="size-4" /> Resume import review
          </motion.button>
        </AnimatePresence>
      )}

      <CreateTaskDialog />
      <ProfileDialog />
      <ProjectDialog />
      <TaskDetailsSheet />
      <BurstOverlay />
      <PageWipe />
      <Toaster />
    </div>
  )
}
