"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Users } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface ActivityDetail {
  id: string
  title: string
  description: string | null
  location: string | null
  start_time: string | null
  end_time: string | null
  budget: number | null
  organizer_id: string
  department_id: string | null
  status: string
  max_participants: number | null
  created_at: string
}

interface ActivityReport {
  id: string
  activity_id: string
  summary: string | null
  photos: string[] | null
  attachments: string[] | null
  participant_count: number | null
  submitted_by: string
  created_at: string
}

interface ProfileOption {
  id: string
  full_name: string | null
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_approval: "default",
  approved: "outline",
  rejected: "destructive",
  completed: "outline",
}

const statusLabel: Record<string, string> = {
  draft: "草稿",
  pending_approval: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
  completed: "已完成",
}

export default function ActivityDetailPage() {
  const params = useParams()
  const router = useRouter()
  const activityId = params.id as string

  const [activity, setActivity] = useState<ActivityDetail | null>(null)
  const [activityReport, setActivityReport] = useState<ActivityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [summary, setSummary] = useState("")
  const [participantCount, setParticipantCount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})
  const didFetch = useRef(false)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    const supabase = supabaseRef.current

    async function load() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        setUser(currentUser)

        // Step 1: Fetch the activity
        const { data: activityData, error: activityError } = await supabase
          .from("activities")
          .select("*")
          .eq("id", activityId)
          .single()

        if (activityError) {
          setError(activityError.message)
          return
        }

        const singleActivity = activityData as unknown as ActivityDetail
        setActivity(singleActivity)

        // Step 2: Fetch the activity report (if exists)
        const { data: reportData } = await supabase
          .from("activity_reports")
          .select("*")
          .eq("activity_id", activityId)
          .order("created_at", { ascending: false })
          .limit(1)

        if (reportData && reportData.length > 0) {
          setActivityReport(reportData[0] as ActivityReport)
        }

        // Step 3: Fetch profiles to build name map
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name")

        const profilesList = (profileData || []) as ProfileOption[]
        const map: Record<string, string> = {}
        for (const p of profilesList) {
          map[p.id] = p.full_name || p.id
        }
        setUserNameMap(map)
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [activityId])

  const handleSubmitSummary = async () => {
    if (!user || !activity || !summary.trim()) return

    setSubmitting(true)
    const supabase = supabaseRef.current

    const { error: submitError } = await supabase.from("activity_reports").insert({
      activity_id: activity.id,
      summary: summary.trim(),
      participant_count: parseInt(participantCount) || 0,
      submitted_by: user.id,
    })

    if (submitError) {
      toast.add({
        type: "error",
        title: "提交失败",
        description: submitError.message,
      })
      setSubmitting(false)
      return
    }

    toast.add({
      type: "success",
      title: "提交成功",
      description: "活动总结已提交",
    })

    setSummary("")
    setSubmitting(false)
  }

  const getOrganizerName = (userId: string) => {
    return userNameMap[userId] || userId
  }

  const showSummarySection = activity && activity.status === "completed"
  const hasSummary = activityReport?.summary && activityReport.summary.trim().length > 0

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()} className="w-fit">
        <ArrowLeft className="mr-1.5 size-4" />
        返回活动列表
      </Button>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : activity ? (
        <>
          {/* Activity Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{activity.title}</CardTitle>
                  <CardDescription className="mt-1">
                    创建时间：{new Date(activity.created_at).toLocaleDateString("zh-CN")}
                  </CardDescription>
                </div>
                <Badge variant={statusBadgeVariant[activity.status] || "outline"} className="text-sm">
                  {statusLabel[activity.status] || activity.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">活动描述</h3>
                <p className="text-sm">{activity.description || "暂无描述"}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">地点：</span>
                  <span>{activity.location || "未设置"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">组织者：</span>
                  <span>{getOrganizerName(activity.organizer_id)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">开始时间：</span>
                  <span>
                    {activity.start_time
                      ? new Date(activity.start_time).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "未设置"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">结束时间：</span>
                  <span>
                    {activity.end_time
                      ? new Date(activity.end_time).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "未设置"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">预算：</span>
                  <span>
                    {activity.budget != null
                      ? `¥${activity.budget.toLocaleString("zh-CN")}`
                      : "未设置"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">最大参与人数：</span>
                  <span>
                    {activity.max_participants != null
                      ? `${activity.max_participants} 人`
                      : "未限制"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Summary Section */}
          {hasSummary && (
            <Card>
              <CardHeader>
                <CardTitle>活动总结</CardTitle>
                <CardDescription>已提交的活动总结报告</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-sm whitespace-pre-wrap">{activityReport!.summary}</p>
                </div>
                {activityReport!.participant_count != null && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">参与人数：</span>
                    <span>{activityReport!.participant_count} 人</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity Summary Input / Report Section */}
          {showSummarySection && !hasSummary && (
            <Card>
              <CardHeader>
                <CardTitle>上传活动总结</CardTitle>
                <CardDescription>
                  活动已完成，请提交活动总结报告
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="summary">总结内容</Label>
                  <Textarea
                    id="summary"
                    placeholder="请描述活动的完成情况、参与人数、效果等..."
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={5}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="participant_count">参与人数</Label>
                  <Input
                    id="participant_count"
                    type="number"
                    placeholder="0"
                    value={participantCount}
                    onChange={(e) => setParticipantCount(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <Button
                  onClick={handleSubmitSummary}
                  disabled={submitting || !summary.trim()}
                >
                  {submitting ? "提交中..." : "提交总结"}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">活动不存在</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}