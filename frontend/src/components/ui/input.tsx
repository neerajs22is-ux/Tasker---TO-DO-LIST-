import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-12 w-full min-w-0 border-[3px] border-black bg-white px-3 py-2 text-base font-bold shadow-[3px_3px_0_0_#000] transition-none placeholder:font-medium placeholder:text-black/40 focus-visible:bg-secondary focus-visible:shadow-[4px_4px_0_0_#000] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-[#fffdf5]',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
