import type { ReactNode } from "react"
import Link from "next/link"
import { LayoutDashboard } from "lucide-react"

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/dashboard" className="inline-flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
              <LayoutDashboard className="size-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">团委管理系统</span>
          </Link>
        </div>
        {children}
      </div>
    </main>
  )
}
