import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const metricCardVariants = cva(
  "flex flex-col gap-1",
  {
    variants: {
      variant: {
        default: "",
        success: "",
        warning: "",
        destructive: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const labelVariants = cva(
  "text-xs",
  {
    variants: {
      variant: {
        default: "text-muted-foreground/70",
        success: "text-muted-foreground/70",
        warning: "text-muted-foreground/70",
        destructive: "text-muted-foreground/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const valueVariants = cva(
  "text-sm font-bold",
  {
    variants: {
      variant: {
        default: "text-foreground",
        success: "text-success",
        warning: "text-warning",
        destructive: "text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface MetricCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof metricCardVariants> {
  label: string
  value: string | number
}

function MetricCard({ className, label, value, variant, ...props }: MetricCardProps) {
  return (
    <div className={cn(metricCardVariants({ variant }), className)} {...props}>
      <span className={labelVariants({ variant })}>{label}</span>
      <span className={valueVariants({ variant })}>{value}</span>
    </div>
  )
}

export { MetricCard, metricCardVariants }
