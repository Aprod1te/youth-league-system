import Link from "next/link"
import { FileQuestion, LayoutDashboard } from "lucide-react"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <FileQuestion className="mx-auto size-10 text-muted-foreground" />
        <p className="mt-5 text-sm font-medium text-primary">404</p>
        <h1 className="mt-1 text-2xl font-semibold">页面不存在</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          该页面可能已移动、删除，或当前链接不正确。
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <LayoutDashboard className="size-4" />
          返回工作台
        </Link>
      </div>
    </main>
  )
}
