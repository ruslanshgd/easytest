import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  label: string
  children: React.ReactNode
  error?: string
  optional?: boolean
  className?: string
  labelClassName?: string
}

export function FormField({
  label,
  children,
  error,
  optional = false,
  className,
  labelClassName,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={label} className={labelClassName}>
        {label}
        {optional && (
          <span className="text-muted-foreground ml-1 text-xs">(опционально)</span>
        )}
      </Label>
      {children}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
