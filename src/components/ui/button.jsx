import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
        outline: 'border border-border bg-card hover:bg-muted',
        ghost: 'hover:bg-muted',
        soft: 'bg-primary/10 text-primary hover:bg-primary/15',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
      },
      size: { default: 'h-11 px-4', sm: 'h-9 px-3 text-xs', lg: 'h-13 px-6 text-base', icon: 'h-10 w-10' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
export { Button, buttonVariants }
