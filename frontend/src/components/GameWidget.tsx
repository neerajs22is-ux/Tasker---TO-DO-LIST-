import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

export function GameWidget() {
  const gs = useStore((s) => s.payload?.game_state)

  if (!gs) return null

  const pct = gs.xp_for_next_level > 0 ? (gs.xp_into_level / gs.xp_for_next_level) * 100 : 100

  return (
    <div className="ml-2 flex items-center gap-2.5 sm:ml-5 sm:gap-3">
      <motion.div
        key={gs.level}
        initial={{ scale: 0.4, rotate: -14 }}
        animate={{ scale: 1, rotate: -2 }}
        transition={{ type: 'spring', stiffness: 320, damping: 15 }}
        className="flex items-center gap-1 border-[3px] border-black bg-secondary px-2 py-1 neo-shadow-sm"
        title={`Level ${gs.level}`}
      >
        <span className="text-[9px] font-black uppercase tracking-widest">Lv</span>
        <span className="text-sm font-black tabular-nums">{gs.level}</span>
      </motion.div>

      <div className="hidden w-40 md:block">
        <Progress value={pct} />
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest tabular-nums">
          {gs.xp_into_level}/{gs.xp_for_next_level} XP to Lv {gs.level + 1}
        </p>
      </div>

      <motion.div
        key={gs.streak_count}
        initial={{ scale: 1.5, rotate: 6 }}
        animate={{ scale: 1, rotate: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        className={cn(
          'flex items-center gap-1 border-[3px] border-black px-1.5 py-0.5',
          gs.streak_count > 0 ? 'bg-destructive text-black neo-shadow-sm' : 'bg-white opacity-70',
        )}
        title={`Streak: ${gs.streak_count} day${gs.streak_count === 1 ? '' : 's'} · longest ${gs.longest_streak}`}
      >
        <Flame className={cn('size-4 stroke-[3]', gs.streak_count === 0 && 'opacity-40')} />
        <span className="text-sm font-black tabular-nums">{gs.streak_count}</span>
        <span className="hidden text-[9px] font-black uppercase tracking-widest lg:inline">
          day streak
        </span>
      </motion.div>
    </div>
  )
}
