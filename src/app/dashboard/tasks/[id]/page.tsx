"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { ArrowLeft, Calendar, User, Flag } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface TaskDetail {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  deadline: string | null
  created_at: string
  created_by: string
  assigned_to: string | null
}

interface ProfileOption {
  id: string
  full_name: string | null
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  in_progress: "default",
  completed: "outline",
  cancelled: "destructive",
}

const statusLabel: Record<string, string> = {
  pending: "待处理",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
}

const priorityBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
}

const priorityLabel: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [feedback, setFeedback] = useState("")
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

        // Step 1: Fetch the task
        const { data: taskData, error: taskError } = await supabase
          .from("tasks")
          .select("*")
          .eq("id", taskId)
          .single()

        if (taskError) {
          setError(taskError.message)
          return
        }

        const singleTask = taskData as unknown as TaskDetail
        setTask(singleTask)

        // Step 2: Fetch profiles to build name map
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
  }, [taskId])

  const handleSubmitFeedback = async () => {
    if (!user || !task || !feedback.trim()) return

    setSubmitting(true)
    const supabase = supabaseRef.current

    // Insert submission
    const { error: submitError } = await supabase.from("task_submissions").insert({
      task_id: task.id,
      user_id: user.id,
      content: feedback.trim(),
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

    // Update task status to completed
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", task.id)

    if (updateError) {
      toast.add({
        type: "error",
        title: "更新失败",
        description: updateError.message,
      })
      setSubmitting(false)
      return
    }

    toast.add({
      type: "success",
      title: "提交成功",
      description: "任务已完成",
    })

    // Update local state
    setTask({ ...task, status: "completed" })
    setFeedback("")
    setSubmitting(false)
  }

  const canSubmit = task && !["completed", "cancelled"].includes(task.status)

  const getCreatorName = (userId: string) => userNameMap[userId] || userId
  const getAssignName = (userId: string | null) => {
    if (!userId) return "未分配"
    return userNameMap[userId] || userId
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()} className="w-fit">
        <ArrowLeft className="mr-1.5 size-4" />
        返回任务列表
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
      ) : task ? (
        <>
          {/* Task Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{task.title}</CardTitle>
                  <CardDescription className="mt-1">
                    创建者：{getCreatorName(task.created_by)}
                  </CardDescription>
                </div>
                <Badge variant={statusBadgeVariant[task.status] || "outline"} className="text-sm">
                  {statusLabel[task.status] || task.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">任务描述</h3>
                <p className="text-sm">{task.description || "暂无描述"}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">负责人：</span>
                  <span>{getAssignName(task.assigned_to)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Flag className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">优先级：</span>
                  <Badge variant={priorityBadgeVariant[task.priority] || "outline"}>
                    {priorityLabel[task.priority] || task.priority}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">截止日期：</span>
                  <span>
                    {task.deadline
                      ? new Date(task.deadline).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })
                      : "未设置"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feedback / Submission Area */}
          {canSubmit && (
            <Card>
              <CardHeader>
                <CardTitle>提交反馈</CardTitle>
                <CardDescription>
                  完成任务后请提交反馈，提交后任务状态将自动变为"已完成"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="feedback">完成内容</Label>
                  <Textarea
                    id="feedback"
                    placeholder="请描述任务的完成情况..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
                    disabled={submitting}
                  />
                </div>
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={submitting || !feedback.trim()}
                >
                  {submitting ? "提交中..." : "提交反馈"}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">任务不存在</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}