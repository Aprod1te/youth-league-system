"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"

interface TaskItem {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  deadline: string | null
  created_by: string
  assigned_to: string | null
  approval_status: string
  approved_by: string | null
  approved_at: string | null
  approval_note: string | null
  created_at: string
}

const priorityBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
}

const priorityLabel: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
}

export default function TaskApprovalPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})

  // Reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [actionLoading, setActionLoading] = useState(false)

  const didFetch = useRef(false)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    const supabase = supabaseRef.current

    async function load() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) {
          router.push("/login")
          return
        }
        // Get user role
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUser.id)
          .maybeSingle()

        if (profileData?.role !== "admin" && profileData?.role !== "secretary") {
          router.push("/dashboard")
          return
        }

        // Fetch pending approval tasks
        const { data: tasksData, error: tasksError } = await supabase
          .from("tasks")
          .select("*")
          .eq("approval_status", "pending_approval")
          .order("created_at", { ascending: false })

        if (tasksError) throw tasksError

        setTasks(tasksData as TaskItem[])

        // Build user name map from all referenced user IDs
        const userIds = new Set<string>()
        for (const t of tasksData || []) {
          if (t.created_by) userIds.add(t.created_by)
          if (t.assigned_to) userIds.add(t.assigned_to)
        }

        if (userIds.size > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, student_id")
            .in("id", [...userIds])

          const nameMap: Record<string, string> = {}
          for (const p of profilesData || []) {
            nameMap[p.id] = p.full_name || p.student_id || p.id
          }
          setUserNameMap(nameMap)
        }
      } catch (err: unknown) {
        console.error("加载任务审批数据失败:", err)
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router])

  const handleApprove = async (taskId: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("review_task", {
      p_task_id: taskId,
      p_decision: "approved",
      p_note: null,
    })

    if (updateError) {
      toast.add({
        type: "error",
        title: "操作失败",
        description: updateError.message,
      })
      setActionLoading(false)
      return
    }

    toast.add({
      type: "success",
      title: "审批通过",
      description: "已通过该任务审批",
    })

    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    setActionLoading(false)
  }

  const openRejectDialog = (taskId: string) => {
    setRejectTargetId(taskId)
    setRejectNote("")
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!rejectTargetId) return

    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("review_task", {
      p_task_id: rejectTargetId,
      p_decision: "rejected",
      p_note: rejectNote.trim() || null,
    })

    if (updateError) {
      toast.add({
        type: "error",
        title: "操作失败",
        description: updateError.message,
      })
      setActionLoading(false)
      return
    }

    toast.add({
      type: "success",
      title: "审批拒绝",
      description: "已拒绝该任务",
    })

    setTasks((prev) => prev.filter((t) => t.id !== rejectTargetId))
    setRejectDialogOpen(false)
    setRejectTargetId(null)
    setActionLoading(false)
  }

  const getUserName = (userId: string) => {
    return userNameMap[userId] || userId
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">任务审批</h1>
        <Badge variant="outline" className="text-sm">
          共 {tasks.length} 条待审批
        </Badge>
      </div>

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
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">暂无待审批的任务</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务标题</TableHead>
                <TableHead>创建人</TableHead>
                <TableHead>执行人</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>截止日期</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">
                    <div>
                      <span>{task.title}</span>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getUserName(task.created_by)}</TableCell>
                  <TableCell>
                    {task.assigned_to ? getUserName(task.assigned_to) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={priorityBadgeVariant[task.priority] || "outline"}>
                      {priorityLabel[task.priority] || task.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {task.deadline
                      ? new Date(task.deadline).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(task.id)}
                        disabled={actionLoading}
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openRejectDialog(task.id)}
                        disabled={actionLoading}
                      >
                        拒绝
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝任务</DialogTitle>
            <DialogDescription>
              请填写拒绝理由（可选）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject_note">审核备注</Label>
              <Textarea
                id="reject_note"
                placeholder="请输入拒绝理由..."
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                disabled={actionLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={actionLoading}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading}
            >
              {actionLoading ? "处理中..." : "确认拒绝"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
