import * as React from "react"
import { cn } from "@/lib/utils"

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
}

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ className, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm",
          "text-foreground shadow-sm",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
FormSelect.displayName = "FormSelect"
