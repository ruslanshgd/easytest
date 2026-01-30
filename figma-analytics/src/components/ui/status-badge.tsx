import * as React from "react"
import { Badge } from "./badge"
import { cn } from "@/lib/utils"

export type SessionStatus = "completed" | "aborted" | "closed" | "active"

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: SessionStatus
}

const statusConfig: Record<SessionStatus, { variant: "success" | "warning" | "destructive" | "default"; label: string }> = {
  completed: { variant: "success", label: "Пройдено" },
  aborted: { variant: "warning", label: "Прервано" },
  closed: { variant: "destructive", label: "Закрыто" },
  active: { variant: "default", label: "Активно" },
}

function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const config = statusConfig[status]
  
  return (
    <Badge variant={config.variant} className={cn(className)} {...props}>
      {config.label}
    </Badge>
  )
}

export { StatusBadge }
