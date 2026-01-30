import * as React from "react"
import { cn } from "@/lib/utils"

type AlertVariant = 'warning' | 'info' | 'destructive' | 'success'

interface AlertBoxProps {
  variant: AlertVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<AlertVariant, string> = {
  warning: "bg-warning-subtle text-warning",
  info: "bg-info-subtle text-primary",
  destructive: "bg-destructive-subtle text-destructive",
  success: "bg-success/10 text-success",
}

export function AlertBox({ variant, children, className }: AlertBoxProps) {
  return (
    <div
      className={cn(
        "rounded-md p-3 text-sm",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </div>
  )
}
