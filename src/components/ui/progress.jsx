import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

const Progress = React.forwardRef(({ className, value = 0, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root ref={ref} value={value} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
    <ProgressPrimitive.Indicator
      className={cn('h-full rounded-full bg-primary transition-all duration-500', indicatorClassName)}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = 'Progress'
export { Progress }
