"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LayoutDashboard, Eye, EyeOff } from "lucide-react"

const registerSchema = z
  .object({
    name: z.string().min(2, "姓名长度至少为 2 位"),
    studentId: z.string().min(1, "请输入学号"),
    email: z.string().email("请输入有效的邮箱地址"),
    password: z.string().min(6, "密码长度至少为 6 位"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  })

type RegisterFormData = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterFormData) => {
    setLoading(true)
    setError(null)

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    })

    if (error) {
      setError(error.message)
      toast.add({
        type: "error",
        title: "注册失败",
        description: error.message,
      })
      setLoading(false)
      return
    }

    // Upsert profile with name and student ID
    if (authData.user) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: authData.user.id,
        full_name: data.name,
        student_id: data.studentId,
      })

      if (profileError) {
        toast.add({
          type: "error",
          title: "个人资料更新失败",
          description: profileError.message,
        })
        setLoading(false)
        return
      }
    }

    toast.add({
      type: "success",
      title: "注册成功",
      description: "注册成功，请登录",
    })
    router.push("/login")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link href="/dashboard" className="inline-flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
              <LayoutDashboard className="size-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">团委管理系统</span>
          </Link>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">注册</CardTitle>
            <CardDescription>
              创建一个新账号以使用团委管理系统
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <Input
                  id="name"
                  placeholder="请输入姓名"
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
                  placeholder="请输入学号"
                  {...register("studentId")}
                  disabled={loading}
                />
                {errors.studentId && (
                  <p className="text-xs text-destructive">{errors.studentId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="yourname@example.com"
                  {...register("email")}
                  disabled={loading}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="至少6位"
                    {...register("password")}
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
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
            <CardFooter className="flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "注册中..." : "注册"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                已有账号？{" "}
                <Link
                  href="/login"
                  className="font-medium text-primary hover:underline"
                >
                  立即登录
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}