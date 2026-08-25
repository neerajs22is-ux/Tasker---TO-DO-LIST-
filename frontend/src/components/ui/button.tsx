import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-bold uppercase tracking-wide transition-all duration-100 ease-linear disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5 [&_svg]:stroke-[2.5] shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFDF5] neo-push",
  {
    variants: {
      variant: {
        default: 'neo-shadow-sm border-4 border-black bg-primary text-black hover:bg-[#ff8585]',
        destructive:
          'border-4 border-black bg-black text-white shadow-[6px_6px_0_0_#ff6b6b] hover:bg-[#1a1a1a]',
        outline:
          'neo-shadow-sm border-4 border-black bg-white text-black hover:bg-secondary',
        secondary: 'neo-shadow-sm border-4 border-black bg-secondary text-black hover:bg-[#ffe266]',
        ghost: 'border-2 border-transparent text-black hover:border-black',
        link: 'text-black underline decoration-4 underline-offset-4 hover:text-primary',
      },
      size: {
        default: 'h-11 px-5 py-2 text-sm has-[>svg]:px-4',
        sm: 'h-9 px-3 text-xs has-[>svg]:px-2.5',
        lg: 'h-14 px-8 text-base',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
