import { motion } from 'framer-motion'
import { ArrowRight, ListTodo, MessageSquareText, Network, Sparkles, Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useStore } from '@/store'

const LOOP = [
  {
    icon: Sparkles,
    title: 'DUMP THE MESS',
    body: 'Paste rambling notes or drop a Markdown / PDF file. Zero structure required.',
    bg: 'bg-white',
    rotate: '-rotate-2',
  },
  {
    icon: MessageSquareText,
    title: 'ANSWER THE AI',
    body: 'A short interview on whatever is ambiguous — order, effort, hidden blockers.',
    bg: 'bg-secondary',
    rotate: 'rotate-1',
  },
  {
    icon: Network,
    title: 'WATCH IT GROW',
    body: 'Quests land as a dependency skill-tree with XP, streaks and priorities.',
    bg: 'bg-muted',
    rotate: '-rotate-1',
  },
]

export function Home() {
  const enterApp = useStore((s) => s.enterApp)
  const payload = useStore((s) => s.payload)
  const gs = payload?.game_state
  const questCount = payload?.tasks.length ?? 0
  const returning = questCount > 0

  return (
    <div className="neo-grid relative flex h-full w-full items-center justify-center overflow-y-auto overflow-x-hidden">
      <Star
        className="animate-spin-slow absolute left-[8%] top-16 size-14 fill-primary stroke-black stroke-[2.5]"
        strokeWidth={2.5}
      />
      <Star
        className="animate-spin-slow absolute bottom-24 right-[10%] size-20 fill-secondary stroke-black stroke-[2.5]"
        strokeWidth={2.5}
      />
      <span className="pointer-events-none absolute -right-6 top-6 select-none text-[9rem] font-black uppercase leading-none tracking-tighter text-black/5">
        TASKER
      </span>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-10 mx-4 my-auto flex w-full max-w-3xl flex-col items-center py-12 text-center"
      >
        <div className="mb-8 -rotate-2 border-4 border-black bg-secondary px-4 py-1.5 neo-shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.25em]">
            Local-first · No accounts · AI-powered
          </p>
        </div>

        <h1 className="text-6xl font-black uppercase leading-[0.85] tracking-tighter sm:text-7xl md:text-8xl">
          MESS IN.
          <br />
          <span className="mt-2 inline-block -rotate-1 border-4 border-black bg-primary px-4 neo-shadow-md">
            TREE OUT.
          </span>
        </h1>

        <p className="mt-7 max-w-xl text-balance text-lg font-bold leading-snug sm:text-xl">
          Paste your chaos. Answer two questions. Get a dependency skill-tree of quests —
          with XP that makes finishing things addictive.
        </p>

        <div className="mt-10 grid w-full gap-5 sm:grid-cols-3 sm:gap-4">
          {LOOP.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.1 }}
              className={`border-4 border-black p-4 text-left neo-shadow-md neo-lift hover:-translate-y-2 hover:shadow-[12px_12px_0_0_#000] ${item.bg} ${item.rotate}`}
            >
              <span className="inline-flex border-2 border-black bg-white p-1.5">
                <item.icon className="size-6 stroke-[3]" />
              </span>
              <p className="mt-3 text-base font-black uppercase tracking-tight">{item.title}</p>
              <p className="mt-1 text-sm font-bold leading-snug">{item.body}</p>
            </motion.div>
          ))}
        </div>

        {returning && gs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <span className="rotate-1 border-4 border-black bg-white px-4 py-1.5 text-sm font-black uppercase tracking-widest neo-shadow-sm">
              Lv {gs.level}
            </span>
            <span className="-rotate-1 border-4 border-black bg-destructive px-4 py-1.5 text-sm font-black uppercase tracking-widest neo-shadow-sm">
              {gs.streak_count} day streak
            </span>
            <span className="rotate-1 border-4 border-black bg-muted px-4 py-1.5 text-sm font-black uppercase tracking-widest neo-shadow-sm">
              {questCount} quests
            </span>
          </motion.div>
        )}

        <Button size="lg" onClick={enterApp} className="group mt-10 h-16 px-12 text-xl">
          {returning ? (
            <>
              CONTINUE — {questCount} QUESTS <ArrowRight className="transition-transform group-hover:translate-x-2" />
            </>
          ) : (
            <>
              START FORGING <ArrowRight className="transition-transform group-hover:translate-x-2" />
            </>
          )}
        </Button>

        <p className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5">
            <kbd className="border-2 border-black bg-white px-1.5 py-0.5">N</kbd> Capture
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="border-2 border-black bg-white px-1.5 py-0.5">G</kbd>/
            <kbd className="border-2 border-black bg-white px-1.5 py-0.5">L</kbd> Views
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="border-2 border-black bg-white px-1.5 py-0.5">?</kbd> Help
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <ListTodo className="size-4" /> Data never leaves this machine
          </span>
        </p>
      </motion.div>
    </div>
  )
}
