"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import "./globals.css"

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
          <div className="max-w-md text-center">
            <AlertTriangle className="mx-auto size-10 text-destructive" />
            <h1 className="mt-5 text-2xl font-semibold">系统暂时不可用</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              应用未能正常启动，请重试。若问题持续出现，请联系管理员。
            </p>
            {error.digest && (
              <p className="mt-2 text-xs text-muted-foreground">错误编号：{error.digest}</p>
            )}
            <button
              type="button"
              className="mt-6 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              onClick={() => unstable_retry()}
            >
              <RotateCcw className="size-4" />
              重新加载
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
