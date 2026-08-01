"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { Calendar, ClipboardList, UserPlus, ExternalLink } from "lucide-react"

// ─── Types ───────────────────────────────────────────────────

interface PendingActivity {
  id: string
  title: string
  description: string | null
  status: string
  organizer_id: string
  location: string | null
  start_time: string | null
  budget: number | null
  created_at: string
}

interface PendingTask {
  id: string
  title: string
  description: string | null
  priority: string
  deadline: string | null
  created_by: string
  assigned_to: string | null
  approval_status: string
  created_at: string
}

interface PendingApplication {
  id: string
  user_id: string
  department_id: string
  status: string
  reason: string | null
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────

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

const appStatusBadge: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "outline",
  rejected: "destructive",
}

const appStatusLabel: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
}

// ─── Page ────────────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("all")

  // Data
  const [activities, setActivities] = useState<PendingActivity[]>([])
  const [tasks, setTasks] = useState<PendingTask[]>([])
  const [applications, setApplications] = useState<PendingApplication[]>([])

  // Name maps
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})
  const [deptNameMap, setDeptNameMap] = useState<Record<string, string>>({})

  // Reject dialog (shared for tasks & activities)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<{ type: string; id: string; title: string; userId: string } | null>(null)
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
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUser.id)
          .maybeSingle()

        if (profileData?.role !== "admin" && profileData?.role !== "secretary") {
          router.push("/dashboard")
          return
        }

        // Fetch all pending items in parallel
        const [
          activitiesResult,
          tasksResult,
          applicationsResult,
        ] = await Promise.all([
          supabase
            .from("activities")
            .select("*")
            .in("status", ["pending_approval", "pending"])
            .order("created_at", { ascending: false }),
          supabase
            .from("tasks")
            .select("*")
            .eq("approval_status", "pending_approval")
            .order("created_at", { ascending: false }),
          supabase
            .from("applications")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
        ])

        if (activitiesResult.error) throw activitiesResult.error
        if (tasksResult.error) throw tasksResult.error
        if (applicationsResult.error) throw applicationsResult.error

        const acts = (activitiesResult.data || []) as PendingActivity[]
        const tsks = (tasksResult.data || []) as PendingTask[]
        const apps = (applicationsResult.data || []) as PendingApplication[]

        setActivities(acts)
        setTasks(tsks)
        setApplications(apps)

        // Build name maps
        const userIds = new Set<string>()
        const deptIds = new Set<string>()

        for (const a of acts) {
          if (a.organizer_id) userIds.add(a.organizer_id)
        }
        for (const t of tsks) {
          if (t.created_by) userIds.add(t.created_by)
          if (t.assigned_to) userIds.add(t.assigned_to)
        }
        for (const a of apps) {
          if (a.user_id) userIds.add(a.user_id)
          if (a.department_id) deptIds.add(a.department_id)
        }

        const [profilesResult, deptsResult] = await Promise.all([
          userIds.size > 0
            ? supabase.from("profiles").select("id, full_name, student_id").in("id", [...userIds])
            : { data: [] },
          deptIds.size > 0
            ? supabase.from("departments").select("id, name").in("id", [...deptIds])
            : { data: [] },
        ])

        const nameMap: Record<string, string> = {}
        for (const p of profilesResult.data || []) {
          nameMap[p.id] = p.full_name || p.student_id || p.id
        }
        setUserNameMap(nameMap)

        const deptMap: Record<string, string> = {}
        for (const d of deptsResult.data || []) {
          deptMap[d.id] = d.name
        }
        setDeptNameMap(deptMap)
      } catch (err: unknown) {
        console.error("加载审核汇总数据失败:", err)
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router])

  // ─── Actions ──────────────────────────────────────────────

  const handleApproveActivity = async (id: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("review_activity", {
      p_activity_id: id,
      p_decision: "approved",
      p_note: null,
    })

    if (updateError) {
      toast.add({ type: "error", title: "操作失败", description: updateError.message })
      setActionLoading(false)
      return
    }

    toast.add({ type: "success", title: "审批通过", description: "已通过该活动审批" })
    setActivities((prev) => prev.filter((a) => a.id !== id))
    setActionLoading(false)
  }

  const handleApproveTask = async (id: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("review_task", {
      p_task_id: id,
      p_decision: "approved",
      p_note: null,
    })

    if (updateError) {
      toast.add({ type: "error", title: "操作失败", description: updateError.message })
      setActionLoading(false)
      return
    }

    toast.add({ type: "success", title: "审批通过", description: "已通过该任务审批" })
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setActionLoading(false)
  }

  const handleApproveApplication = async (id: string) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase.rpc("review_application", {
      p_application_id: id,
      p_decision: "approved",
      p_note: null,
    })

    if (updateError) {
      toast.add({ type: "error", title: "操作失败", description: updateError.message })
      setActionLoading(false)
      return
    }

    toast.add({ type: "success", title: "审批通过", description: "已通过该入部申请" })
    setApplications((prev) => prev.filter((a) => a.id !== id))
    setActionLoading(false)
  }

  const openRejectDialog = (type: string, id: string, title: string, userId: string) => {
    setRejectTarget({ type, id, title, userId })
    setRejectNote("")
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!rejectTarget) return
    setActionLoading(true)
    const supabase = supabaseRef.current
    const { type, id } = rejectTarget

    if (type === "activity") {
      const { error } = await supabase.rpc("review_activity", {
        p_activity_id: id,
        p_decision: "rejected",
        p_note: rejectNote.trim() || null,
      })

      if (error) {
        toast.add({ type: "error", title: "操作失败", description: error.message })
        setActionLoading(false)
        return
      }

      setActivities((prev) => prev.filter((a) => a.id !== id))
    } else if (type === "task") {
      const { error } = await supabase.rpc("review_task", {
        p_task_id: id,
        p_decision: "rejected",
        p_note: rejectNote.trim() || null,
      })

      if (error) {
        toast.add({ type: "error", title: "操作失败", description: error.message })
        setActionLoading(false)
        return
      }

      setTasks((prev) => prev.filter((t) => t.id !== id))
    }

    toast.add({ type: "success", title: "已拒绝", description: `已拒绝该${type === "activity" ? "活动" : "任务"}` })
    setRejectDialogOpen(false)
    setRejectTarget(null)
    setActionLoading(false)
  }

  // ─── Computed ─────────────────────────────────────────────

  const totalPending = activities.length + tasks.length + applications.length

  // ─── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-8 text-center">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">审核汇总</h1>
        <Badge variant="outline" className="text-sm">
          共 {totalPending} 条待处理
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">待审批活动</CardTitle>
            <Calendar className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activities.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">待审批任务</CardTitle>
            <ClipboardList className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">待审核入部申请</CardTitle>
            <UserPlus className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{applications.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed detail view */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">全部 ({totalPending})</TabsTrigger>
          <TabsTrigger value="activities">活动 ({activities.length})</TabsTrigger>
          <TabsTrigger value="tasks">任务 ({tasks.length})</TabsTrigger>
          <TabsTrigger value="applications">入部申请 ({applications.length})</TabsTrigger>
        </TabsList>

        {/* ─── All Tab ─────────────────────────── */}
        <TabsContent value="all" className="space-y-6">
          {activities.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="size-4" /> 待审批活动
                  <Link href="/dashboard/activities/approval">
                    <Button variant="ghost" size="sm" className="ml-2">
                      查看全部 <ExternalLink className="size-3 ml-1" />
                    </Button>
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>组织者</TableHead>
                      <TableHead>地点</TableHead>
                      <TableHead>开始时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.slice(0, 5).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.title}</TableCell>
                        <TableCell>{userNameMap[a.organizer_id] || a.organizer_id}</TableCell>
                        <TableCell>{a.location || "-"}</TableCell>
                        <TableCell>
                          {a.start_time
                            ? new Date(a.start_time).toLocaleDateString("zh-CN")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveActivity(a.id)} disabled={actionLoading}>
                              通过
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openRejectDialog("activity", a.id, a.title, a.organizer_id)} disabled={actionLoading}>
                              拒绝
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tasks.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="size-4" /> 待审批任务
                  <Link href="/dashboard/tasks/approval">
                    <Button variant="ghost" size="sm" className="ml-2">
                      查看全部 <ExternalLink className="size-3 ml-1" />
                    </Button>
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>创建人</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead>截止日期</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.slice(0, 5).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell>{userNameMap[t.created_by] || t.created_by}</TableCell>
                        <TableCell>
                          <Badge variant={priorityBadgeVariant[t.priority] || "outline"}>
                            {priorityLabel[t.priority] || t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {t.deadline
                            ? new Date(t.deadline).toLocaleDateString("zh-CN")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveTask(t.id)} disabled={actionLoading}>
                              通过
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openRejectDialog("task", t.id, t.title, t.created_by)} disabled={actionLoading}>
                              拒绝
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {applications.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="size-4" /> 待审核入部申请
                  <Link href="/dashboard/applications">
                    <Button variant="ghost" size="sm" className="ml-2">
                      查看全部 <ExternalLink className="size-3 ml-1" />
                    </Button>
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>申请人</TableHead>
                      <TableHead>申请部门</TableHead>
                      <TableHead>申请理由</TableHead>
                      <TableHead>申请时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.slice(0, 5).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{userNameMap[a.user_id] || a.user_id}</TableCell>
                        <TableCell>{deptNameMap[a.department_id] || a.department_id}</TableCell>
                        <TableCell className="max-w-xs truncate">{a.reason || "-"}</TableCell>
                        <TableCell>
                          {new Date(a.created_at).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => handleApproveApplication(a.id)} disabled={actionLoading}>
                            通过
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {totalPending === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">暂无待审核的项目</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Activities Tab ──────────────────── */}
        <TabsContent value="activities">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">待审批活动</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {activities.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">暂无待审批的活动</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>组织者</TableHead>
                      <TableHead>地点</TableHead>
                      <TableHead>开始时间</TableHead>
                      <TableHead>预算</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.title}</TableCell>
                        <TableCell>{userNameMap[a.organizer_id] || a.organizer_id}</TableCell>
                        <TableCell>{a.location || "-"}</TableCell>
                        <TableCell>
                          {a.start_time
                            ? new Date(a.start_time).toLocaleDateString("zh-CN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell>{a.budget != null ? `¥${a.budget}` : "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveActivity(a.id)} disabled={actionLoading}>
                              通过
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openRejectDialog("activity", a.id, a.title, a.organizer_id)} disabled={actionLoading}>
                              拒绝
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tasks Tab ───────────────────────── */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">待审批任务</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tasks.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">暂无待审批的任务</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>创建人</TableHead>
                      <TableHead>执行人</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead>截止日期</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell>{userNameMap[t.created_by] || t.created_by}</TableCell>
                        <TableCell>{t.assigned_to ? (userNameMap[t.assigned_to] || t.assigned_to) : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={priorityBadgeVariant[t.priority] || "outline"}>
                            {priorityLabel[t.priority] || t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {t.deadline
                            ? new Date(t.deadline).toLocaleDateString("zh-CN")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveTask(t.id)} disabled={actionLoading}>
                              通过
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openRejectDialog("task", t.id, t.title, t.created_by)} disabled={actionLoading}>
                              拒绝
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Applications Tab ────────────────── */}
        <TabsContent value="applications">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">待审核入部申请</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {applications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">暂无待审核的入部申请</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>申请人</TableHead>
                      <TableHead>申请部门</TableHead>
                      <TableHead>申请理由</TableHead>
                      <TableHead>申请时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{userNameMap[a.user_id] || a.user_id}</TableCell>
                        <TableCell>{deptNameMap[a.department_id] || a.department_id}</TableCell>
                        <TableCell className="max-w-xs truncate">{a.reason || "-"}</TableCell>
                        <TableCell>
                          {new Date(a.created_at).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={appStatusBadge[a.status] || "outline"}>
                            {appStatusLabel[a.status] || a.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleApproveApplication(a.id)} disabled={actionLoading}>
                              通过
                            </Button>
                            <Button size="sm" variant="outline" disabled>
                              拒绝
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝{rejectTarget?.type === "activity" ? "活动" : "任务"}</DialogTitle>
            <DialogDescription>请填写拒绝理由（可选）</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="review_reject_note">审核备注</Label>
              <Textarea
                id="review_reject_note"
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
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
              {actionLoading ? "处理中..." : "确认拒绝"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
