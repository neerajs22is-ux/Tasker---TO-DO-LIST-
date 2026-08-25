import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap px-2 py-0.5 text-[11px] font-black uppercase tracking-widest w-fit shrink-0 [&>svg]:size-3 [&>svg]:stroke-[3]',
  {
    variants: {
      variant: {
        default: 'border-2 border-black bg-primary text-black shadow-[2px_2px_0_0_#000]',
        secondary: 'border-2 border-black bg-muted text-black',
        locked: 'border-2 border-dashed border-black bg-background text-black opacity-70',
        available: 'border-2 border-black bg-secondary text-black shadow-[2px_2px_0_0_#000]',
        progress: 'border-2 border-black bg-muted text-black shadow-[2px_2px_0_0_#000]',
        done: 'border-2 border-black bg-white text-black line-through',
        overdue: 'animate-hard-pulse border-2 border-black bg-destructive text-black',
        accent: 'border-2 border-black bg-secondary text-black -rotate-1 shadow-[2px_2px_0_0_#000]',
        outline: 'border-2 border-black bg-white text-black',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
