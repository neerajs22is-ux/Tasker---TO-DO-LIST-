import { motion } from 'framer-motion'

import { useStore } from '@/store'

const EASE = [0.2, 0, 0.8, 1] as const

function Panel({
  variant,
  phase,
  label,
}: {
  variant: string
  phase: 'cover' | 'reveal'
  label: string
}) {
  const covered = phase === 'cover'

  if (variant === 'iris') {
    return (
      <motion.div
        className="pointer-events-auto fixed inset-0 z-[150] flex items-center justify-center bg-black"
        initial={{ clipPath: 'circle(0% at 50% 50%)' }}
        animate={{ clipPath: covered ? 'circle(75% at 50% 50%)' : 'circle(0% at 50% 50%)' }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        <Sticker label={label} />
      </motion.div>
    )
  }

  if (variant === 'doorH') {
    return (
      <>
        <motion.div
          className="pointer-events-auto fixed inset-x-0 top-0 z-[150] h-1/2 border-b-8 border-secondary bg-black"
          initial={{ y: '-100%' }}
          animate={{ y: covered ? '0%' : '-100%' }}
          transition={{ duration: 0.28, ease: EASE }}
        />
        <motion.div
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[150] h-1/2 border-t-8 border-primary bg-black"
          initial={{ y: '100%' }}
          animate={{ y: covered ? '0%' : '100%' }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          <Sticker label={label} bottom />
        </motion.div>
      </>
    )
  }

  const vertical = variant === 'wipeUp'
  return (
    <motion.div
      className={`pointer-events-auto fixed inset-0 z-[150] bg-black ${
        vertical ? 'border-b-8 border-secondary' : 'border-r-8 border-secondary'
      }`}
      initial={vertical ? { y: '-102%' } : { x: '-102%' }}
      animate={
        covered
          ? vertical
            ? { y: '0%' }
            : { x: '0%' }
          : vertical
            ? { y: '102%' }
            : { x: '102%' }
      }
      transition={{ duration: 0.3, ease: EASE }}
    >
      <Sticker label={label} />
    </motion.div>
  )
}

function Sticker({ label, bottom }: { label: string; bottom?: boolean }) {
  return (
    <span
      className={`absolute left-1/2 -translate-x-1/2 -rotate-3 border-4 border-secondary bg-black px-6 py-2 text-4xl font-black uppercase tracking-tighter text-secondary sm:text-6xl ${
        bottom ? 'bottom-10' : 'top-1/2 -translate-y-1/2'
      }`}
    >
      {label}
    </span>
  )
}

export function PageWipe() {
  const transition = useStore((s) => s.transition)
  if (!transition) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[150] overflow-hidden">
      <Panel variant={transition.variant} phase={transition.phase} label={transition.label} />
    </div>
  )
}
