import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useStore, type Burst } from '@/store'

const COLORS = ['#ff6b6b', '#c4b5fd', '#ffd93d', '#000000']

function BurstFx({ burst }: { burst: Burst }) {
  const clear = useStore((s) => s.bursts)

  useEffect(() => {
    const timer = setTimeout(() => {
      useStore.setState({
        bursts: clear.filter((b) => b.id !== burst.id),
      })
    }, 1200)
    return () => clearTimeout(timer)
  }, [burst.id, clear])

  return (
    <div
      className="pointer-events-none fixed z-[100]"
      style={{ left: burst.x, top: burst.y }}
    >
      {Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4
        const dist = 46 + Math.random() * 42
        return (
          <motion.span
            key={i}
            className="absolute block size-1.5 rounded-full"
            style={{ background: COLORS[i % COLORS.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1.2 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: 0,
              scale: 0.3,
            }}
            transition={{ duration: 0.75, ease: 'easeOut' }}
          />
        )
      })}
      <motion.span
        className="absolute -translate-x-1/2 whitespace-nowrap text-sm font-extrabold text-primary drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]"
        initial={{ opacity: 1, y: 0 }}
        animate={{ opacity: 0, y: -44 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        +{burst.xp} XP
      </motion.span>
    </div>
  )
}

export function BurstOverlay() {
  const bursts = useStore((s) => s.bursts)
  return (
    <AnimatePresence>
      {bursts.map((b) => (
        <BurstFx key={b.id} burst={b} />
      ))}
    </AnimatePresence>
  )
}
