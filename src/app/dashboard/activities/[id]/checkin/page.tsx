"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckSquare, ArrowLeft, CheckCircle2, XCircle, Loader2 } from "lucide-react"

type CheckinResult = "idle" | "success" | "exists" | "error"

export default function CheckinPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activityId = params.id as string
  const token = searchParams.get("token")

  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState<{ title: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkinResult, setCheckinResult] = useState<CheckinResult>("idle")
  const [resultMessage, setResultMessage] = useState("")
  const [userName, setUserName] = useState("")

  const performCheckin = useCallback(async () => {
    if (!token) {
      setCheckinResult("error")
      setResultMessage("签到链接无效或已过期")
      return
    }

    setCheckingIn(true)
    const supabase = createClient()
    const { error: checkinError } = await supabase.rpc("check_in_activity", {
      p_activity_id: activityId,
      p_token: token,
    })

    if (checkinError) {
      setCheckinResult("error")
      setResultMessage(checkinError.message || "签到失败，请稍后重试")
    } else {
      setCheckinResult("success")
      setResultMessage("签到成功")
    }
    setCheckingIn(false)
  }, [activityId, token])

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setError("请先登录")
        setLoading(false)
        return
      }

      const [{ data: activityData, error: activityError }, { data: profile }] = await Promise.all([
        supabase.from("activities").select("title, status").eq("id", activityId).single(),
        supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      ])

      if (activityError || !activityData) {
        setError("活动不存在")
        setLoading(false)
        return
      }

      setActivity(activityData)
      setUserName(profile?.full_name || user.email || "用户")
      setLoading(false)
      await performCheckin()
    }

    void init()
  }, [activityId, performCheckin])

  const handleRetry = async () => {
    setCheckinResult("idle")
    setResultMessage("")
    await performCheckin()
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">正在处理签到...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 py-8 text-center">
            <XCircle className="mx-auto size-12 text-destructive" />
            <p className="font-medium text-destructive">{error}</p>
            <Button variant="outline" onClick={() => router.push("/dashboard/activities")}>返回活动列表</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <CheckSquare className="size-5" />
            扫码签到
          </CardTitle>
          <CardDescription className="line-clamp-2">{activity?.title || "活动签到"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {checkinResult === "success" && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-12 text-green-600" />
              <div>
                <p className="text-lg font-semibold text-green-600">{resultMessage}</p>
                <p className="mt-1 text-sm text-muted-foreground">{userName}</p>
              </div>
            </div>
          )}

          {checkinResult === "error" && (
            <div className="space-y-4 text-center">
              <XCircle className="mx-auto size-12 text-destructive" />
              <div>
                <p className="text-lg font-semibold text-destructive">签到失败</p>
                <p className="mt-1 text-sm text-muted-foreground">{resultMessage}</p>
              </div>
              <Button onClick={handleRetry} disabled={checkingIn}>
                {checkingIn && <Loader2 className="mr-2 size-4 animate-spin" />}
                重新签到
              </Button>
            </div>
          )}

          {checkinResult === "idle" && (
            <div className="space-y-4 text-center">
              <Loader2 className="mx-auto size-12 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">正在签到...</p>
            </div>
          )}

          <div className="flex justify-center border-t pt-2">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/activities/${activityId}`)}>
              <ArrowLeft className="mr-1.5 size-4" />
              返回活动详情
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
