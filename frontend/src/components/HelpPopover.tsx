import { CircleHelp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const SHORTCUTS: [string, string][] = [
  ['N', 'New quest'],
  ['G', 'Graph view'],
  ['L', 'List view'],
  ['Del / Backspace', 'Delete selected dependency'],
  ['Esc', 'Cancel linking / close panels'],
  ['?', 'Toggle this help'],
]

const GESTURES: [string, string][] = [
  ['Click quest', 'Open details'],
  ['Hover quest', 'Toolbar: done · open · link'],
  ['Drag dot → dot', 'Create a dependency'],
  ['Shift + drag canvas', 'Box-select quests'],
  ['Space / middle drag', 'Pan the canvas'],
  ['Click edge, then ×', 'Sever a dependency'],
]

export function HelpPopover({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" title="Help & shortcuts (?)" aria-label="Help">
          <CircleHelp />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <h3 className="text-sm font-semibold">How Tasker works</h3>

        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Gestures
        </p>
        <dl className="mt-1.5 space-y-1.5">
          {GESTURES.map(([action, result]) => (
            <div key={action} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="shrink-0 font-medium">{action}</dt>
              <dd className="text-right text-muted-foreground">{result}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Shortcuts
        </p>
        <dl className="mt-1.5 space-y-1.5">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-xs">
              <dd className="text-muted-foreground">{action}</dd>
              <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                {key}
              </kbd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
