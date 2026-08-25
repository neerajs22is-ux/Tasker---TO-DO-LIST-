import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-3 w-full grow border-2 border-black bg-white">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-5 border-[3px] border-black bg-secondary shadow-[2px_2px_0_0_#000] transition-none outline-none focus-visible:ring-4 focus-visible:ring-black hover:bg-primary" />
    </SliderPrimitive.Root>
  )
}

export { Slider }
