"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, MailCheck } from "lucide-react"
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
import { buildAuthCallbackUrl } from "@/lib/auth"
import { createClient } from "@/lib/supabase/client"

const forgotPasswordSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setLoading(true)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      data.email,
      {
        redirectTo: buildAuthCallbackUrl(
          window.location.origin,
          "/reset-password"
        ),
      }
    )

    if (resetError) {
      const message = "暂时无法发送重置邮件，请稍后再试。"
      setError(message)
      setLoading(false)
      toast.add({
        type: "error",
        title: "发送失败",
        description: message,
      })
      return
    }

    setSent(true)
    setLoading(false)
    toast.add({
      type: "success",
      title: "请求已提交",
      description: "请检查邮箱中的重置链接。",
    })
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
        {sent ? (
          <>
            <CardHeader className="items-center space-y-3 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <MailCheck className="size-5" />
              </div>
              <CardTitle className="text-xl">检查您的邮箱</CardTitle>
              <CardDescription>
                如果该邮箱已注册，系统会发送密码重置链接。请同时检查垃圾邮件目录。
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ArrowLeft className="size-4" />
                返回登录
              </Link>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">找回密码</CardTitle>
              <CardDescription>
                输入注册邮箱，系统将发送密码重置链接
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
              <CardContent className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="yourname@example.com"
                  {...register("email")}
                  disabled={loading}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex-col gap-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "发送中..." : "发送重置邮件"}
                </Button>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                >
                  <ArrowLeft className="size-4" />
                  返回登录
                </Link>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </AuthShell>
  )
}
