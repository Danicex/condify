import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', {
  variants: {
    variant: {
      default: 'bg-primary/10 text-primary',
      success: 'bg-success/10 text-success',
      muted: 'bg-muted text-muted-foreground',
      accent: 'bg-accent/25 text-foreground',
      destructive: 'bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
})
export const Badge = ({ className, variant, ...props }) => <span className={cn(badgeVariants({ variant }), className)} {...props} />
