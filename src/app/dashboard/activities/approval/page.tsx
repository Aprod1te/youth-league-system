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
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface Activity {
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

interface ProfileOption {
  id: string
  full_name: string | null
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_approval: "default",
  approved: "outline",
  rejected: "destructive",
}

const statusLabel: Record<string, string> = {
  pending_approval: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
}

export default function ActivityApprovalPage() {
  const router = useRouter()
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userDeptId, setUserDeptId] = useState<string | null>(null)
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
        setUser(currentUser)

        // Check user role and get department
        let currentRole: string | null = null
        let currentDeptId: string | null = null
        if (currentUser) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role, department_id")
            .eq("id", currentUser.id)
            .single()

          if (profileData) {
            currentRole = (profileData as { role: string }).role
            currentDeptId = (profileData as { department_id: string | null }).department_id
          }
          setUserRole(currentRole)
          setUserDeptId(currentDeptId)

          // Route guard: applicant and member cannot access this page
          if (currentRole === "applicant" || currentRole === "member") {
            router.push("/dashboard")
            return
          }

          if (currentRole !== "admin" && currentRole !== "secretary" && currentRole !== "minister") {
            setError("您没有审批权限")
            setLoading(false)
            return
          }
        }

        // Step 1: Fetch activities with status pending_approval
        let activityQuery = supabase
          .from("activities")
          .select("*")
          .eq("status", "pending_approval")
          .order("created_at", { ascending: false })

        // If minister, only show activities for their department
        if (currentRole === "minister" && currentDeptId) {
          activityQuery = activityQuery.eq("department_id", currentDeptId)
        }

        const { data: activityData, error: activityError } = await activityQuery

        if (activityError) {
          setError(activityError.message)
          return
        }

        setActivities((activityData || []) as Activity[])

        // Step 2: Fetch profiles for name map
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
  }, [])

  const handleApprove = async (activityId: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase
      .from("activities")
      .update({ status: "approved", approved_by: user?.id || null })
      .eq("id", activityId)

    if (updateError) {
      toast.add({
        type: "error",
        title: "操作失败",
        description: updateError.message,
      })
      setActionLoading(false)
      return
    }

    // Create notification for the organizer
    const targetActivity = activities.find((a) => a.id === activityId)
    if (targetActivity) {
      console.log("正在创建通知给用户:", targetActivity.organizer_id)
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: targetActivity.organizer_id,
        title: "活动审批通过",
        content: `你的活动"${targetActivity.title}"已通过审批`,
        type: "activity",
        related_id: activityId,
        is_read: false,
      })
      if (notifError) {
        console.error("创建通知失败:", notifError)
      }
    }

    toast.add({
      type: "success",
      title: "审批通过",
      description: "活动已批准",
    })

    setActivities((prev) => prev.filter((a) => a.id !== activityId))
    setActionLoading(false)
  }

  const openRejectDialog = (activityId: string) => {
    setRejectTargetId(activityId)
    setRejectNote("")
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!rejectTargetId) return

    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase
      .from("activities")
      .update({
        status: "rejected",
        approval_note: rejectNote.trim() || null,
        approved_by: user?.id || null,
      })
      .eq("id", rejectTargetId)

    if (updateError) {
      toast.add({
        type: "error",
        title: "操作失败",
        description: updateError.message,
      })
      setActionLoading(false)
      return
    }

    // Create notification for the organizer
    const targetActivity = activities.find((a) => a.id === rejectTargetId)
    if (targetActivity) {
      console.log("正在创建通知给用户:", targetActivity.organizer_id)
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: targetActivity.organizer_id,
        title: "活动审批未通过",
        content: `你的活动"${targetActivity.title}"未通过审批，原因：${rejectNote.trim() || "不符合要求"}`,
        type: "activity",
        related_id: rejectTargetId,
        is_read: false,
      })
      if (notifError) {
        console.error("创建通知失败:", notifError)
      }
    }

    toast.add({
      type: "success",
      title: "审批拒绝",
      description: "已拒绝该活动",
    })

    setActivities((prev) => prev.filter((a) => a.id !== rejectTargetId))
    setRejectDialogOpen(false)
    setRejectTargetId(null)
    setActionLoading(false)
  }

  const getOrganizerName = (userId: string) => {
    return userNameMap[userId] || userId
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">活动审批</h1>
        <Badge variant="outline" className="text-sm">
          共 {activities.length} 条待审批
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
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">暂无待审批的活动</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>活动标题</TableHead>
                <TableHead>组织者</TableHead>
                <TableHead>地点</TableHead>
                <TableHead>开始时间</TableHead>
                <TableHead>预算</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.map((activity) => (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium">
                    <div>
                      <span>{activity.title}</span>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {activity.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getOrganizerName(activity.organizer_id)}</TableCell>
                  <TableCell>{activity.location || "-"}</TableCell>
                  <TableCell>
                    {activity.start_time
                      ? new Date(activity.start_time).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>{activity.budget != null ? `¥${activity.budget}` : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[activity.status] || "outline"}>
                      {statusLabel[activity.status] || activity.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(activity.id)}
                        disabled={actionLoading}
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openRejectDialog(activity.id)}
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
            <DialogTitle>拒绝活动</DialogTitle>
            <DialogDescription>
              请填写拒绝理由（可选）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject_note">审核备注</Label>
              <Textarea
                id="reject_note"
                placeholder="请输入拒接理由..."
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