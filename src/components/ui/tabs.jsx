import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root
const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn('grid w-full grid-cols-3 gap-1 rounded-2xl bg-muted p-1', className)} {...props} />
))
TabsList.displayName = 'TabsList'
const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-muted-foreground transition-all data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'
const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none animate-fade-in', className)} {...props} />
))
TabsContent.displayName = 'TabsContent'
export { Tabs, TabsList, TabsTrigger, TabsContent }
