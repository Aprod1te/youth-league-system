"use client"

import { cn } from "@/lib/utils"
import { FolderOpen } from "lucide-react"
import Link from "next/link"

interface EmptyStateProps {
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  className?: string
}

export function EmptyState({
  icon,
  title = "暂无数据",
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 animate-fade-in",
        className
      )}
    >
      <div className="text-muted-foreground/30 mb-4">
        {icon || <FolderOpen className="size-12" />}
      </div>
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground text-sm font-medium whitespace-nowrap transition-all h-7 gap-1 px-2.5"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground text-sm font-medium whitespace-nowrap transition-all h-7 gap-1 px-2.5 cursor-pointer"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}