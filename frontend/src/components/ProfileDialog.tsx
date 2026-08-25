import { useState } from 'react'
import { Trash2, UserRound } from 'lucide-react'

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
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

const SWATCHES = ['#FFD93D', '#FF6B6B', '#C4B5FD', '#FFFFFF', '#000000']

export function ProfileDialog() {
  const open = useStore((s) => s.profileOpen)
  const setOpen = useStore((s) => s.setProfileOpen)
  const gs = useStore((s) => s.payload?.game_state)
  const updateProfile = useStore((s) => s.updateProfile)
  const resetGame = useStore((s) => s.resetGame)

  const [name, setName] = useState(gs?.profile_name ?? '')
  const [color, setColor] = useState(gs?.profile_color ?? '#FFD93D')
  const [confirmScope, setConfirmScope] = useState<'stats' | 'tasks' | 'all' | null>(null)

  if (!gs) return null

  const dirty =
    name !== gs.profile_name || color !== gs.profile_color

  const CONFIRM_COPY: Record<
    'stats' | 'tasks' | 'all',
    { title: string; desc: string; label: string }
  > = {
    stats: {
      title: 'Reset stats?',
      desc: 'XP, level, streak and history go back to zero. Quests stay.',
      label: 'Reset stats',
    },
    tasks: {
      title: 'Delete ALL quests?',
      desc: 'Every quest and dependency link is deleted. Stats and profile stay.',
      label: 'Delete quests',
    },
    all: {
      title: 'Full factory wipe?',
      desc: 'Quests, projects, logs, stats — everything back to day zero. Cannot be undone.',
      label: 'Wipe everything',
    },
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-5 stroke-[3]" /> PROFILE
          </DialogTitle>
          <DialogDescription>Stored locally. No accounts, ever.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <span
            className="flex size-16 shrink-0 items-center justify-center border-4 border-black text-2xl font-black uppercase neo-shadow-sm"
            style={{ background: color }}
          >
            {(name.trim()[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="PLAYER NAME"
              className="h-11 uppercase"
            />
            <div className="flex gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`color ${c}`}
                  className={cn(
                    'size-8 border-[3px] border-black transition-transform hover:-translate-y-0.5',
                    color === c && 'ring-4 ring-black ring-offset-2 ring-offset-card',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {dirty && (
          <Button
            onClick={() => void updateProfile(name.trim(), color)}
            disabled={name.trim() === ''}
          >
            Save profile
          </Button>
        )}

        <Separator />

        <div>
          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-destructive">
            <Trash2 className="size-3.5" /> Danger zone
          </p>
          <div className="mt-2 grid gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmScope('stats')}>
              RESET STATS
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmScope('tasks')}>
              DELETE ALL QUESTS
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmScope('all')}>
              FULL FACTORY WIPE
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmScope !== null}
          onClose={() => setConfirmScope(null)}
          destructive
          confirmLabel={confirmScope ? CONFIRM_COPY[confirmScope].label : ''}
          title={confirmScope ? CONFIRM_COPY[confirmScope].title : ''}
          description={confirmScope ? CONFIRM_COPY[confirmScope].desc : ''}
          onConfirm={() => (confirmScope ? resetGame(confirmScope).then(() => setProfileClose(setOpen)) : Promise.resolve())}
        />
      </DialogContent>
    </Dialog>
  )
}

function setProfileClose(setOpen: (v: boolean) => void) {
  setOpen(false)
}
