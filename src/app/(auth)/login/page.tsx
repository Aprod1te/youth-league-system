"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { createClient } from "@/lib/supabase/client"
import { resolveAuthFeedback } from "@/lib/auth"
import { resolveSafeRedirectPath } from "@/lib/navigation"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthShell } from "@/components/auth-shell"
import { Eye, EyeOff } from "lucide-react"

const loginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码长度至少为 6 位"),
})

type LoginFormData = z.infer<typeof loginSchema>

function AuthQueryFeedback() {
  const searchParams = useSearchParams()
  const feedback = resolveAuthFeedback(
    searchParams.get("error"),
    searchParams.get("notice")
  )

  if (!feedback) return null

  return (
    <div
      className={
        feedback.kind === "error"
          ? "mb-4 rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive"
          : "mb-4 rounded-lg bg-emerald-500/10 p-3 text-center text-sm text-emerald-700 dark:text-emerald-400"
      }
      role="status"
    >
      {feedback.message}
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) {
      setError(error.message)
      toast.add({
        type: "error",
        title: "登录失败",
        description: error.message,
      })
      setLoading(false)
    } else {
      toast.add({
        type: "success",
        title: "登录成功",
        description: "正在跳转到工作台...",
      })
      router.refresh()
      const nextPath = new URLSearchParams(window.location.search).get("next")
      router.push(resolveSafeRedirectPath(nextPath))
    }
  }

  return (
    <AuthShell>
      {error ? (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
          {error}
        </div>
      ) : (
        <Suspense fallback={null}>
          <AuthQueryFeedback />
        </Suspense>
      )}

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">登录</CardTitle>
          <CardDescription>使用您的邮箱和密码登录系统</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="admin@example.com"
                {...register("email")}
                disabled={loading}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">密码</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary"
                >
                  忘记密码？
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              系统仅限受邀用户登录
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  )
}
