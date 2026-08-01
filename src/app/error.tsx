"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ErrorPage({
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
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto size-10 text-destructive" />
        <h1 className="mt-5 text-2xl font-semibold">页面暂时无法加载</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          系统遇到了意外问题，请重试。若问题持续出现，请联系管理员。
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground">错误编号：{error.digest}</p>
        )}
        <Button className="mt-6" onClick={() => unstable_retry()}>
          <RotateCcw />
          重新加载
        </Button>
      </div>
    </main>
  )
}
