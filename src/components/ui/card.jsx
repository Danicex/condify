import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-3xl border bg-card text-card-foreground shadow-sm', className)} {...props} />
))
Card.displayName = 'Card'
const CardHeader = ({ className, ...p }) => <div className={cn('flex flex-col gap-1 p-5 pb-2', className)} {...p} />
const CardTitle = ({ className, ...p }) => <h3 className={cn('text-sm font-bold tracking-tight', className)} {...p} />
const CardDescription = ({ className, ...p }) => <p className={cn('text-xs text-muted-foreground', className)} {...p} />
const CardContent = ({ className, ...p }) => <div className={cn('p-5 pt-2', className)} {...p} />
export { Card, CardHeader, CardTitle, CardDescription, CardContent }
