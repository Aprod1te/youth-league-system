"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Eye, EyeOff, UserRoundCheck } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"

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

const acceptInviteSchema = z
  .object({
    name: z.string().trim().min(2, "姓名长度至少为 2 位"),
    studentId: z.string().trim().min(1, "请输入学号"),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `密码长度至少为 ${MIN_PASSWORD_LENGTH} 位`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  })

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>
type InviteStatus = "checking" | "ready" | "invalid"

export default function AcceptInvitePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<InviteStatus>("checking")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
  })

  useEffect(() => {
    let active = true

    const verifyInvitation = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!active) return
      if (!user || userError) {
        setStatus("invalid")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, student_id")
        .eq("id", user.id)
        .maybeSingle()

      if (!active) return
      reset({
        name: profile?.full_name || "",
        studentId: profile?.student_id || "",
        password: "",
        confirmPassword: "",
      })
      setStatus("ready")
    }

    void verifyInvitation()
    return () => {
      active = false
    }
  }, [reset, supabase])

  const onSubmit = async (data: AcceptInviteFormData) => {
    setLoading(true)
    setError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (!user || userError) {
      setStatus("invalid")
      setLoading(false)
      return
    }

    const profileValues = {
      full_name: data.name.trim(),
      student_id: data.studentId.trim(),
    }
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileValues)
      .eq("id", user.id)

    if (profileError) {
      const message = profileError.message.includes("duplicate")
        ? "该学号已被使用，请核对后重试。"
        : "个人资料保存失败，请稍后重试。"
      setError(message)
      setLoading(false)
      toast.add({ type: "error", title: "设置失败", description: message })
      return
    }

    const { error: passwordError } = await supabase.auth.updateUser({
      password: data.password,
      data: profileValues,
    })

    if (passwordError) {
      const message = "资料已保存，但密码设置失败，请在当前页面重试。"
      setError(message)
      setLoading(false)
      toast.add({ type: "error", title: "设置失败", description: message })
      return
    }

    const { error: signOutError } = await supabase.auth.signOut({
      scope: "global",
    })
    if (signOutError) {
      await supabase.auth.signOut({ scope: "local" })
    }

    toast.add({ type: "success", title: "邀请已确认" })
    router.replace("/login?notice=invite_accepted")
    router.refresh()
  }

  if (status === "checking") {
    return (
      <AuthShell>
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl">验证邀请</CardTitle>
            <CardDescription>正在确认邀请链接...</CardDescription>
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
            <CardTitle className="text-xl">邀请链接无效</CardTitle>
            <CardDescription>
              此邀请已过期或已被使用，请联系管理员重新发送。
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link
              href="/login"
              className="text-sm font-medium text-primary hover:underline"
            >
              返回登录
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
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserRoundCheck className="size-5" />
          </div>
          <CardTitle className="text-xl">接受邀请</CardTitle>
          <CardDescription>完善身份信息并设置登录密码</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                autoComplete="name"
                {...register("name")}
                disabled={loading}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="studentId">学号</Label>
              <Input
                id="studentId"
                autoComplete="username"
                {...register("studentId")}
                disabled={loading}
              />
              {errors.studentId && (
                <p className="text-xs text-destructive">
                  {errors.studentId.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
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
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
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
              {loading ? "设置中..." : "确认邀请"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  )
}
