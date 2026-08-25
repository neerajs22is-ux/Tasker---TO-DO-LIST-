import { Toaster as Sonner } from 'sonner'

function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            '!bg-card !border-4 !border-black !text-black !rounded-none !shadow-[8px_8px_0_0_#000] !font-bold',
          description: '!text-black/80 !font-medium',
          actionButton: '!bg-primary !text-black !border-2 !border-black',
        },
      }}
    />
  )
}

export { Toaster }
