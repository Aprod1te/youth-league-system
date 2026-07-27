"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface Application {
  id: string
  user_id: string
  department_id: string
  status: string
  reason: string | null
  reviewed_by: string | null
  review_note: string | null
  created_at: string
}

interface ProfileOption {
  id: string
  full_name: string | null
  student_id: string | null
}

interface DepartmentOption {
  id: string
  name: string
}

const statusFilterOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
]

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "outline",
  rejected: "destructive",
}

const statusLabel: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [filteredApplications, setFilteredApplications] = useState<Application[]>([])
  const [filterStatus, setFilterStatus] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userDeptId, setUserDeptId] = useState<string | null>(null)

  // Name maps
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})
  const [userStudentIdMap, setUserStudentIdMap] = useState<Record<string, string>>({})
  const [deptNameMap, setDeptNameMap] = useState<Record<string, string>>({})

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

        // Step 0: Get current user profile for role/department
        let currentRole: string | null = null
        let currentDeptId: string | null = null
        if (currentUser) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role, department_id")
            .eq("id", currentUser.id)
            .single()

          if (profileData) {
            currentRole = profileData.role
            currentDeptId = profileData.department_id
          }
        }
        setUserRole(currentRole)
        setUserDeptId(currentDeptId)

        // Step 1: Fetch applications
        let appQuery = supabase
          .from("applications")
          .select("*")
          .order("created_at", { ascending: false })

        // If minister, only show applications for their department
        if (currentRole === "minister" && currentDeptId) {
          appQuery = appQuery.eq("department_id", currentDeptId)
        }

        const { data: appData, error: appError } = await appQuery

        if (appError) {
          setError(appError.message)
          return
        }

        const appList = (appData || []) as Application[]
        setApplications(appList)
        setFilteredApplications(appList)

        // Step 2: Fetch profiles
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, student_id")

        const profilesList = (profileData || []) as ProfileOption[]
        const nameMap: Record<string, string> = {}
        const sidMap: Record<string, string> = {}
        for (const p of profilesList) {
          nameMap[p.id] = p.full_name || p.id
          sidMap[p.id] = p.student_id || "-"
        }
        setUserNameMap(nameMap)
        setUserStudentIdMap(sidMap)

        // Step 3: Fetch departments
        const { data: deptData } = await supabase
          .from("departments")
          .select("id, name")

        const deptList = (deptData || []) as DepartmentOption[]
        const dMap: Record<string, string> = {}
        for (const d of deptList) {
          dMap[d.id] = d.name
        }
        setDeptNameMap(dMap)
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  // Filter effect
  useEffect(() => {
    if (filterStatus === "all") {
      setFilteredApplications(applications)
    } else {
      setFilteredApplications(applications.filter((a) => a.status === filterStatus))
    }
  }, [filterStatus, applications])

  const handleApprove = async (applicationId: string, app: Application) => {
    setActionLoading(true)
    const supabase = supabaseRef.current

    // Update application status
    const { error: updateError } = await supabase
      .from("applications")
      .update({ status: "approved", reviewed_by: user?.id || null })
      .eq("id", applicationId)

    if (updateError) {
      toast.add({
        type: "error",
        title: "操作失败",
        description: updateError.message,
      })
      setActionLoading(false)
      return
    }

    // Update profile: set department_id and role
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ department_id: app.department_id, role: "member" })
      .eq("id", app.user_id)

    if (profileError) {
      console.error("更新用户资料失败:", profileError)
      toast.add({
        type: "error",
        title: "更新用户信息失败",
        description: profileError.message,
      })
      setActionLoading(false)
      return
    }

    // Create notification for the applicant
    console.log("正在创建通知给用户:", app.user_id)
    const deptName = deptNameMap[app.department_id] || ""
    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: app.user_id,
      title: "入部申请已通过",
      content: `恭喜！你的入部申请已通过审核，欢迎加入${deptName}！`,
      type: "application",
      related_id: app.id,
      is_read: false,
    })
    if (notifError) {
      console.error("创建通知失败:", notifError)
    }

    toast.add({
      type: "success",
      title: "审核通过",
      description: `已批准 ${userNameMap[app.user_id] || app.user_id} 的入部申请`,
    })

    // Update local state
    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, status: "approved", reviewed_by: user?.id || null } : a))
    )
    setActionLoading(false)
  }

  const openRejectDialog = (applicationId: string) => {
    setRejectTargetId(applicationId)
    setRejectNote("")
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!rejectTargetId) return

    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "rejected",
        reviewed_by: user?.id || null,
        review_note: rejectNote.trim() || null,
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

    const targetApp = applications.find((a) => a.id === rejectTargetId)

    // Create notification for the applicant
    if (targetApp) {
      console.log("正在创建通知给用户:", targetApp.user_id)
      const deptName = deptNameMap[targetApp.department_id] || ""
      const reasonText = rejectNote.trim() ? `原因：${rejectNote.trim()}` : ""
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: targetApp.user_id,
        title: "入部申请未通过",
        content: `很遗憾，你的入部申请${deptName ? `（${deptName}）` : ""}未通过审核。${reasonText}`,
        type: "application",
        related_id: rejectTargetId,
        is_read: false,
      })
      if (notifError) {
        console.error("创建通知失败:", notifError)
      }
    }

    toast.add({
      type: "success",
      title: "已拒绝",
      description: `已拒绝 ${targetApp ? userNameMap[targetApp.user_id] || targetApp.user_id : ""} 的入部申请`,
    })

    setApplications((prev) =>
      prev.map((a) =>
        a.id === rejectTargetId
          ? { ...a, status: "rejected", reviewed_by: user?.id || null, review_note: rejectNote.trim() || null }
          : a
      )
    )
    setRejectDialogOpen(false)
    setRejectTargetId(null)
    setActionLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">入部审核</h1>
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
      ) : filteredApplications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {filterStatus !== "all" ? "没有匹配该状态的申请" : "暂无入部申请"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>申请人</TableHead>
                <TableHead>学号</TableHead>
                <TableHead>申请部门</TableHead>
                <TableHead>申请理由</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApplications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">
                    {userNameMap[app.user_id] || app.user_id}
                  </TableCell>
                  <TableCell>{userStudentIdMap[app.user_id] || "-"}</TableCell>
                  <TableCell>{deptNameMap[app.department_id] || app.department_id}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {app.reason || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[app.status] || "outline"}>
                      {statusLabel[app.status] || app.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(app.created_at).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    {app.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(app.id, app)}
                          disabled={actionLoading}
                        >
                          通过
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRejectDialog(app.id)}
                          disabled={actionLoading}
                        >
                          拒绝
                        </Button>
                      </div>
                    )}
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
            <DialogTitle>拒绝申请</DialogTitle>
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