"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Eye, EyeOff } from "lucide-react"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { MIN_PASSWORD_LENGTH } from "@/lib/auth"
import { createClient } from "@/lib/supabase/client"

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `密码长度至少为 ${MIN_PASSWORD_LENGTH} 位`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  })

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>
type RecoveryStatus = "checking" | "ready" | "invalid"

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<RecoveryStatus>("checking")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  useEffect(() => {
    let active = true

    const verifySession = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (active) {
        setStatus(user && !userError ? "ready" : "invalid")
      }
    }

    void verifySession()
    return () => {
      active = false
    }
  }, [supabase])

  const onSubmit = async (data: ResetPasswordFormData) => {
    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({
      password: data.password,
    })

    if (updateError) {
      const message = "密码更新失败，重置链接可能已失效，请重新申请。"
      setError(message)
      setLoading(false)
      toast.add({
        type: "error",
        title: "更新失败",
        description: message,
      })
      return
    }

    const { error: signOutError } = await supabase.auth.signOut({
      scope: "global",
    })
    if (signOutError) {
      await supabase.auth.signOut({ scope: "local" })
    }

    toast.add({
      type: "success",
      title: "密码已更新",
      description: "请使用新密码重新登录。",
    })
    router.replace("/login?notice=password_updated")
    router.refresh()
  }

  if (status === "checking") {
    return (
      <AuthShell>
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl">验证重置链接</CardTitle>
            <CardDescription>正在确认链接有效性...</CardDescription>
          </CardHeader>
        </Card>
      </AuthShell>
    )
  }

  if (status === "invalid") {
    return (
      <AuthShell>
        <Card>
          <CardHeader className="items-center space-y-3 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <CircleAlert className="size-5" />
            </div>
            <CardTitle className="text-xl">重置链接无效</CardTitle>
            <CardDescription>
              此链接已过期或未完成验证，请重新申请密码重置邮件。
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              重新申请重置链接
            </Link>
          </CardFooter>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      {error && (
        <div
          className="mb-4 rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">设置新密码</CardTitle>
          <CardDescription>
            新密码至少需要 {MIN_PASSWORD_LENGTH} 位
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">新密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={`至少${MIN_PASSWORD_LENGTH}位`}
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="再次输入新密码"
                {...register("confirmPassword")}
                disabled={loading}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "更新中..." : "更新密码"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  )
}
