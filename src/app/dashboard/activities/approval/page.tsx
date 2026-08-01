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

        // Check user role before loading approval data.
        let currentRole: string | null = null
        const { data: roleProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUser.id)
          .single()

        if (roleProfile) {
          currentRole = roleProfile.role
        }
        if (currentRole !== "admin" && currentRole !== "secretary") {
          router.push("/dashboard")
          return
        }

        // Step 1: Fetch activities with status pending_approval
        const activityQuery = supabase
          .from("activities")
          .select("*")
          .eq("status", "pending_approval")
          .order("created_at", { ascending: false })

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
  }, [router])

  const handleApprove = async (activityId: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("review_activity", {
      p_activity_id: activityId,
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

    const { error: updateError } = await supabase.rpc("review_activity", {
      p_activity_id: rejectTargetId,
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
        <h1 className="text-2xl font-bold">活动审批</h1>
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
