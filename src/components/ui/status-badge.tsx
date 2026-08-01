"use client"

import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        pending: "bg-warning/10 text-warning border-warning/20",
        approved: "bg-success/10 text-success border-success/20",
        rejected: "bg-destructive/10 text-destructive border-destructive/20",
        completed: "bg-primary/10 text-primary border-primary/20",
        submitted: "bg-accent text-accent-foreground border-accent",
        draft: "bg-muted text-muted-foreground border-border",
        in_progress: "bg-primary/10 text-primary border-primary/20",
        cancelled: "bg-muted text-muted-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "draft",
    },
  }
)

const statusLabels: Record<string, string> = {
  pending: "待审批",
  pending_approval: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
  completed: "已完成",
  submitted: "已提交",
  draft: "草稿",
  in_progress: "进行中",
  cancelled: "已取消",
}

type StatusVariant = NonNullable<VariantProps<typeof statusBadgeVariants>["variant"]>

const statusVariantMap: Record<string, StatusVariant> = {
  pending: "pending",
  pending_approval: "pending",
  approved: "approved",
  rejected: "rejected",
  completed: "completed",
  submitted: "submitted",
  draft: "draft",
  in_progress: "in_progress",
  cancelled: "cancelled",
}

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  status: string
  className?: string
}

export function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  const mappedVariant = variant ?? statusVariantMap[status] ?? "draft"

  const label = statusLabels[status] || status

  return (
    <span className={cn(statusBadgeVariants({ variant: mappedVariant }), className)}>
      {label}
    </span>
  )
}

export { statusBadgeVariants }
