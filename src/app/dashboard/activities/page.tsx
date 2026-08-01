"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { Plus, CheckCircle, FileText } from "lucide-react"
import type { User } from "@supabase/supabase-js"

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

const statusFilterOptions = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "pending_approval", label: "待审批" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
  { value: "completed", label: "已完成" },
]

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

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [filterStatus, setFilterStatus] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userDepartmentId, setUserDepartmentId] = useState<string | null>(null)
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})

  // Create activity dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newLocation, setNewLocation] = useState("")
  const [newStartTime, setNewStartTime] = useState("")
  const [newEndTime, setNewEndTime] = useState("")
  const [newBudget, setNewBudget] = useState("")
  const [newMaxParticipants, setNewMaxParticipants] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Summary dialog state
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [summaryTargetId, setSummaryTargetId] = useState<string | null>(null)
  const [summaryContent, setSummaryContent] = useState("")
  const [summaryParticipantCount, setSummaryParticipantCount] = useState("")
  const [summarySubmitting, setSummarySubmitting] = useState(false)

  const didFetch = useRef(false)
  const supabaseRef = useRef(createClient())

  const loadActivities = async () => {
    const supabase = supabaseRef.current

    // Step 1: Fetch activities
    const { data: activityData, error: activityError } = await supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false })

    if (activityError) {
      setError(activityError.message)
      return
    }

    const activityList = (activityData || []) as unknown as Activity[]
    setActivities(activityList)

    // Step 2: Fetch all profiles for name map
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name")

    const profilesList = (profileData || []) as ProfileOption[]
    const map: Record<string, string> = {}
    for (const p of profilesList) {
      map[p.id] = p.full_name || "未命名成员"
    }
    setUserNameMap(map)
  }

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    const supabase = supabaseRef.current

    async function load() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        setUser(currentUser)
        if (currentUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, department_id")
            .eq("id", currentUser.id)
            .maybeSingle()
          setUserRole(profile?.role ?? null)
          setUserDepartmentId(profile?.department_id ?? null)
        }
        await loadActivities()
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const filteredActivities = useMemo(
    () =>
      filterStatus === "all"
        ? activities
        : activities.filter((activity) => activity.status === filterStatus),
    [activities, filterStatus]
  )

  const getOrganizerName = (userId: string) => {
    return userNameMap[userId] || "未公开"
  }

  const handleSubmitForApproval = async (activityId: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("submit_activity_for_approval", {
      p_activity_id: activityId,
    })

    if (updateError) {
      console.error("Submit for approval error:", updateError)
      toast.add({
        type: "error",
        title: "提交失败",
        description: updateError.message,
      })
      setActionLoading(false)
      return
    }

    toast.add({
      type: "success",
      title: "提交成功",
      description: "活动已提交审批",
    })

    setActivities((prev) =>
      prev.map((a) => (a.id === activityId ? { ...a, status: "pending_approval" } : a))
    )
    setActionLoading(false)
  }

  const handleMarkComplete = async (activityId: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("set_activity_lifecycle_status", {
      p_activity_id: activityId,
      p_status: "completed",
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
      title: "已完成",
      description: "活动已标记为完成",
    })

    setActivities((prev) =>
      prev.map((a) => (a.id === activityId ? { ...a, status: "completed" } : a))
    )
    setActionLoading(false)
  }

  const openSummaryDialog = (activityId: string) => {
    setSummaryTargetId(activityId)
    setSummaryContent("")
    setSummaryParticipantCount("")
    setSummaryDialogOpen(true)
  }

  const handleUploadSummary = async () => {
    if (!summaryTargetId || !summaryContent.trim() || !user) return

    setSummarySubmitting(true)
    const supabase = supabaseRef.current

    const { error: insertError } = await supabase.rpc("submit_activity_report", {
      p_activity_id: summaryTargetId,
      p_summary: summaryContent.trim(),
      p_participant_count: parseInt(summaryParticipantCount) || 0,
      p_photos: [],
      p_attachments: [],
    })

    if (insertError) {
      toast.add({
        type: "error",
        title: "上传失败",
        description: insertError.message,
      })
      setSummarySubmitting(false)
      return
    }

    toast.add({
      type: "success",
      title: "总结上传成功",
      description: "活动总结已保存",
    })

    setSummaryDialogOpen(false)
    setSummaryTargetId(null)
    setSummaryContent("")
    setSummaryParticipantCount("")
    setSummarySubmitting(false)

    // Refresh list
    await loadActivities()
  }

  const handleCreateActivity = async () => {
    if (!user || !newTitle.trim()) return

    setSubmitting(true)
    const supabase = supabaseRef.current

    const { error: insertError } = await supabase.rpc("create_activity", {
      p_title: newTitle.trim(),
      p_description: newDescription.trim() || null,
      p_location: newLocation.trim() || null,
      p_start_time: newStartTime || null,
      p_end_time: newEndTime || null,
      p_budget: newBudget ? Number(newBudget) : null,
      p_max_participants: newMaxParticipants ? Number(newMaxParticipants) : null,
    })

    if (insertError) {
      toast.add({
        type: "error",
        title: "创建失败",
        description: insertError.message,
      })
      setSubmitting(false)
      return
    }

    toast.add({
      type: "success",
      title: "创建成功",
      description: "活动已创建",
    })

    // Refresh activity list
    await loadActivities()

    // Reset form
    setNewTitle("")
    setNewDescription("")
    setNewLocation("")
    setNewStartTime("")
    setNewEndTime("")
    setNewBudget("")
    setNewMaxParticipants("")
    setDialogOpen(false)
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">活动管理</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">状态筛选：</span>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value ?? "all")}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {userRole && userRole !== "applicant" && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              新建活动
            </Button>
          )}
        </div>
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
      ) : filteredActivities.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {filterStatus !== "all" ? "没有匹配该状态的活动" : "暂无活动数据"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>活动标题</TableHead>
                <TableHead>地点</TableHead>
                <TableHead>开始时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>组织者</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.map((activity) => (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium">
                    <div>
                      <Link
                        href={`/dashboard/activities/${activity.id}`}
                        className="text-primary hover:underline"
                      >
                        {activity.title}
                      </Link>
                      {activity.status === "completed" && (
                        <p className="text-xs text-muted-foreground mt-1">已完成</p>
                      )}
                    </div>
                  </TableCell>
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
                  <TableCell>
                    <Badge variant={statusBadgeVariant[activity.status] || "outline"}>
                      {statusLabel[activity.status] || activity.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{getOrganizerName(activity.organizer_id)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {activity.status === "draft" &&
                        (activity.organizer_id === user?.id || userRole === "admin" || userRole === "secretary") && (
                        <Button
                          size="sm"
                          onClick={() => handleSubmitForApproval(activity.id)}
                          disabled={actionLoading}
                        >
                          提交审批
                        </Button>
                      )}
                      {activity.status === "approved" &&
                        (activity.organizer_id === user?.id ||
                          userRole === "admin" ||
                          userRole === "secretary" ||
                          (userRole === "minister" && activity.department_id === userDepartmentId)) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkComplete(activity.id)}
                          disabled={actionLoading}
                        >
                          <CheckCircle className="mr-1 size-3" />
                          标记完成
                        </Button>
                      )}
                      {activity.status === "completed" &&
                        (activity.organizer_id === user?.id ||
                          userRole === "admin" ||
                          userRole === "secretary" ||
                          (userRole === "minister" && activity.department_id === userDepartmentId)) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openSummaryDialog(activity.id)}
                          disabled={actionLoading}
                        >
                          <FileText className="mr-1 size-3" />
                          上传总结
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Activity Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建活动</DialogTitle>
            <DialogDescription>
              创建活动草稿，审批通过后面向全体受邀用户开放
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">活动标题</Label>
              <Input
                id="title"
                placeholder="请输入活动标题"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">活动描述</Label>
              <Textarea
                id="description"
                placeholder="请输入活动描述"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">地点</Label>
              <Input
                id="location"
                placeholder="请输入活动地点"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_time">开始时间</Label>
                <Input
                  id="start_time"
                  type="datetime-local"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">结束时间</Label>
                <Input
                  id="end_time"
                  type="datetime-local"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">预算</Label>
                <Input
                  id="budget"
                  type="number"
                  placeholder="0"
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_participants">最大参与人数</Label>
                <Input
                  id="max_participants"
                  type="number"
                  placeholder="0"
                  value={newMaxParticipants}
                  onChange={(e) => setNewMaxParticipants(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              onClick={handleCreateActivity}
              disabled={submitting || !newTitle.trim()}
            >
              {submitting ? "创建中..." : "创建活动"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary Dialog */}
      <Dialog open={summaryDialogOpen} onOpenChange={setSummaryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传活动总结</DialogTitle>
            <DialogDescription>
              请填写本次活动总结，上传后将自动标记活动为已完成
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="summary_content">活动总结</Label>
              <Textarea
                id="summary_content"
                placeholder="请输入活动总结..."
                value={summaryContent}
                onChange={(e) => setSummaryContent(e.target.value)}
                rows={6}
                disabled={summarySubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="participant_count">参与人数</Label>
              <Input
                id="participant_count"
                type="number"
                placeholder="0"
                value={summaryParticipantCount}
                onChange={(e) => setSummaryParticipantCount(e.target.value)}
                disabled={summarySubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSummaryDialogOpen(false)}
              disabled={summarySubmitting}
            >
              取消
            </Button>
            <Button
              onClick={handleUploadSummary}
              disabled={summarySubmitting || !summaryContent.trim()}
            >
              {summarySubmitting ? "上传中..." : "保存总结"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
