import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full border-[3px] border-black bg-white px-3 py-2 text-base font-bold shadow-[3px_3px_0_0_#000] transition-none placeholder:font-medium placeholder:text-black/40 focus-visible:bg-secondary focus-visible:shadow-[4px_4px_0_0_#000] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
