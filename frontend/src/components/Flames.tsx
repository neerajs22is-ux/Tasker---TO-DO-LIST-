import { Flame } from 'lucide-react'

import { cn } from '@/lib/utils'

export function Flames({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  if (count <= 0) return null
  return (
    <span className={cn('inline-flex items-center gap-px', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Flame
          key={i}
          className={cn(
            'size-3 animate-flame fill-primary stroke-black stroke-[2]',
            i === count - 1 && count >= 4 && 'size-4 fill-destructive',
          )}
          style={{ animationDelay: `${i * 130}ms` }}
        />
      ))}
    </span>
  )
}
