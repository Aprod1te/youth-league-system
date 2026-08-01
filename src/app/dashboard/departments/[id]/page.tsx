"use client"

import { useEffect, useState, useRef, use } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/toast"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  Building2,
  Users,
  CalendarDays,
  UserMinus,
  Crown,
  FileText,
  Clock,
  ExternalLink,
  Pencil,
} from "lucide-react"

interface Department {
  id: string
  name: string
  description: string | null
  max_members: number | null
  created_at: string | null
}

interface Member {
  id: string
  full_name: string | null
  student_id: string | null
  role: string
  created_at: string | null
}

interface Activity {
  id: string
  title: string
  status: string
  start_time: string | null
  end_time: string | null
}

export default function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: departmentId } = use(params)
  const [department, setDepartment] = useState<Department | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>("applicant")
  const [userDepartmentId, setUserDepartmentId] = useState<string | null>(null)

  // Edit department
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editMaxMembers, setEditMaxMembers] = useState("")
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Remove member
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removingMember, setRemovingMember] = useState<Member | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  // Promote to minister
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false)
  const [promotingMember, setPromotingMember] = useState<Member | null>(null)
  const [promoteLoading, setPromoteLoading] = useState(false)

  const didFetch = useRef(false)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    const supabase = supabaseRef.current

    async function load() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        // Load department info
        const { data: deptData, error: deptError } = await supabase
          .from("departments")
          .select("id, name, description, max_members, created_at")
          .eq("id", departmentId)
          .single()

        if (deptError || !deptData) {
          setError("部门不存在或已被删除")
          setLoading(false)
          return
        }
        setDepartment(deptData)

        let canViewMembers = false

        // Load user profile
        if (currentUser) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("department_id, role")
            .eq("id", currentUser.id)
            .maybeSingle()

          if (profileData?.department_id) {
            setUserDepartmentId(profileData.department_id)
          }
          if (profileData?.role) {
            setUserRole(profileData.role)
            canViewMembers = profileData.role !== "applicant"
          }
        }

        if (canViewMembers) {
          const { data: memberData } = await supabase
            .from("profiles")
            .select("id, full_name, student_id, role, created_at")
            .eq("department_id", departmentId)
            .order("created_at", { ascending: true })

          setMembers(memberData || [])
        }

        // Load department activities (recent 5)
        const { data: activityData } = await supabase
          .from("activities")
          .select("id, title, status, start_time, end_time")
          .eq("department_id", departmentId)
          .order("created_at", { ascending: false })
          .limit(5)

        setActivities(activityData || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [departmentId])

  const canManage =
    userRole === "admin" ||
    userRole === "secretary" ||
    (userRole === "minister" && userDepartmentId === departmentId)
  const canAppointMinister = userRole === "admin" || userRole === "secretary"
  const canViewMembers = userRole !== "applicant"
  const ministers = members.filter((m) => m.role === "minister")

  // Remove member
  const handleRemoveOpen = (member: Member) => {
    setRemovingMember(member)
    setRemoveDialogOpen(true)
  }

  const handleRemoveConfirm = async () => {
    if (!removingMember) return
    setRemoveLoading(true)
    const supabase = supabaseRef.current

    const { error } = await supabase.rpc("remove_department_member", {
      p_department_id: departmentId,
      p_user_id: removingMember.id,
    })

    if (error) {
      toast.add({ type: "error", title: "操作失败", description: error.message })
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== removingMember.id))
      toast.add({ type: "success", title: "已移除", description: `${removingMember.full_name} 已移出该部门` })
      setRemoveDialogOpen(false)
    }
    setRemoveLoading(false)
  }

  // Promote to minister
  const handlePromoteOpen = (member: Member) => {
    setPromotingMember(member)
    setPromoteDialogOpen(true)
  }

  const handlePromoteConfirm = async () => {
    if (!promotingMember) return
    setPromoteLoading(true)
    const supabase = supabaseRef.current

    const { error } = await supabase.rpc("promote_department_minister", {
      p_department_id: departmentId,
      p_user_id: promotingMember.id,
    })

    if (error) {
      toast.add({ type: "error", title: "操作失败", description: error.message })
    } else {
      setMembers((prev) =>
        prev.map((m) => {
          if (m.id === promotingMember.id) return { ...m, role: "minister" }
          if (ministers.find((min) => min.id === m.id)) return { ...m, role: "member" }
          return m
        })
      )
      toast.add({ type: "success", title: "已设部长", description: `${promotingMember.full_name} 已成为该部门部长` })
      setPromoteDialogOpen(false)
    }
    setPromoteLoading(false)
  }

  // Edit department
  const handleEditOpen = () => {
    if (!department) return
    setEditName(department.name)
    setEditDescription(department.description || "")
    setEditMaxMembers(department.max_members?.toString() || "50")
    setEditError(null)
    setEditDialogOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!department) return
    if (!editName.trim()) {
      setEditError("部门名称不能为空")
      return
    }
    const maxMembersNum = parseInt(editMaxMembers)
    if (!editMaxMembers || isNaN(maxMembersNum) || maxMembersNum <= 0) {
      setEditError("人数上限必须为正整数")
      return
    }

    setEditSubmitting(true)
    setEditError(null)
    const supabase = supabaseRef.current
    const { error } = await supabase.rpc("update_department", {
      p_department_id: department.id,
      p_name: editName.trim(),
      p_description: editDescription.trim() || null,
      p_max_members: maxMembersNum,
    })

    if (error) {
      setEditError(error.message)
    } else {
      setDepartment((prev) =>
        prev ? { ...prev, name: editName.trim(), description: editDescription.trim() || null, max_members: maxMembersNum } : prev
      )
      toast.add({ type: "success", title: "更新成功", description: "部门信息已更新" })
      setEditDialogOpen(false)
    }
    setEditSubmitting(false)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "待审核"
      case "approved":
        return "已通过"
      case "rejected":
      case "cancelled":
        return "已取消"
      case "ongoing":
        return "进行中"
      case "completed":
        return "已完成"
      default:
        return status
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="加载中..."
          breadcrumbs={[
            { label: "部门管理", href: "/dashboard/departments" },
            { label: "部门详情" },
          ]}
        />
        <div className="space-y-4 animate-pulse">
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="h-5 w-32 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !department) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="部门详情"
          breadcrumbs={[
            { label: "部门管理", href: "/dashboard/departments" },
            { label: "未找到" },
          ]}
        />
        <EmptyState
          icon={<Building2 className="size-12" />}
          title="部门不存在"
          description={error || "该部门可能已被删除"}
          action={{ label: "返回部门列表", href: "/dashboard/departments" }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={department.name}
        description={department.description || undefined}
        breadcrumbs={[
          { label: "部门管理", href: "/dashboard/departments" },
          { label: department.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <Button variant="outline" size="default" className="gap-2" onClick={handleEditOpen}>
                <Pencil className="size-4" />
                编辑部门
              </Button>
            )}
            <Link href="/dashboard/departments">
              <Button variant="outline" size="default" className="gap-2">
                <ArrowLeft className="size-4" />
                返回
              </Button>
            </Link>
          </div>
        }
      />

      {/* Info Cards */}
      <div
        className={
          canViewMembers
            ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            : "grid gap-4 sm:grid-cols-2"
        }
      >
        {canViewMembers && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">当前人数</CardTitle>
                <Users className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium">{members.length}</div>
                {department.max_members && (
                  <p className="text-xs text-muted-foreground mt-1">
                    上限 {department.max_members} 人
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">部长</CardTitle>
                <Crown className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">
                  {ministers.length > 0
                    ? ministers.map((m) => m.full_name || "未命名成员").join("、")
                    : "暂无部长"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {ministers.length} 位部长
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">近期活动</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{activities.length}</div>
            <p className="text-xs text-muted-foreground mt-1">最近 5 条活动</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">创建时间</CardTitle>
            <CalendarDays className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {formatDate(department.created_at)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">部门成立日期</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Members Section */}
        {canViewMembers && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">部门成员</CardTitle>
                <CardDescription>
                  共 {members.length} 位成员
                  {canManage && (
                    <Link
                      href={`/dashboard/applications?department=${departmentId}`}
                      className="ml-2 text-primary hover:underline"
                    >
                      查看入部申请
                    </Link>
                  )}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <EmptyState
                  icon={<Users className="size-10" />}
                  title="暂无成员"
                  description="该部门还没有成员加入"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>学号</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>加入时间</TableHead>
                      {canManage && <TableHead className="text-right">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.full_name || "未命名成员"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.student_id || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={member.role === "minister" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {member.role === "minister" && <Crown className="size-3 mr-1" />}
                            {member.role === "minister"
                              ? "部长"
                              : member.role === "member"
                              ? "成员"
                              : member.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(member.created_at)}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Can only remove members, not ministers */}
                              {member.role === "member" && (
                                <Button
                                  variant="ghost"
                                  size="default"
                                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleRemoveOpen(member)}
                                >
                                  <UserMinus className="size-3.5" />
                                  移除
                                </Button>
                              )}
                              {/* Only system-level management can appoint a minister. */}
                              {canAppointMinister && member.role !== "minister" && (
                                <Button
                                  variant="ghost"
                                  size="default"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => handlePromoteOpen(member)}
                                >
                                  <Crown className="size-3.5" />
                                  设为部长
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activities Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">部门活动</CardTitle>
            <CardDescription>该部门创建的近期活动</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <EmptyState
                icon={<FileText className="size-10" />}
                title="暂无活动"
                description="该部门还没有创建活动"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>活动名称</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>开始时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{activity.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {getStatusLabel(activity.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatDate(activity.start_time)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/dashboard/activities/${activity.id}`}>
                          <Button variant="ghost" size="default" className="h-7 gap-1 text-xs">
                            <ExternalLink className="size-3.5" />
                            查看
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Remove Member Confirm Dialog */}
      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title="确认移除成员"
        description={`确定要将「${removingMember?.full_name}」移出该部门吗？移除后该成员将变为普通申请人身份。`}
        confirmLabel="确认移除"
        cancelLabel="取消"
        variant="destructive"
        onConfirm={handleRemoveConfirm}
        loading={removeLoading}
      />

      {/* Promote to Minister Confirm Dialog */}
      <ConfirmDialog
        open={promoteDialogOpen}
        onOpenChange={setPromoteDialogOpen}
        title="确认设为部长"
        description={`确定要将「${promotingMember?.full_name}」设为该部门部长吗？${
          ministers.length > 0
            ? `当前部长「${ministers.map((m) => m.full_name).join("、")}」将被降为普通成员。`
            : ""
        }`}
        confirmLabel="确认设置"
        cancelLabel="取消"
        variant="default"
        onConfirm={handlePromoteConfirm}
        loading={promoteLoading}
      />

      {/* Edit Department Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑部门</DialogTitle>
            <DialogDescription>修改部门的基本信息。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">部门名称</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="请输入部门名称" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">部门描述</Label>
              <Textarea id="edit-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="请输入部门描述（选填）" rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-max-members">人数上限</Label>
              <Input id="edit-max-members" type="number" value={editMaxMembers} onChange={(e) => setEditMaxMembers(e.target.value)} placeholder="请输入人数上限" min={1} />
            </div>
            {editError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{editError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditError(null) }} disabled={editSubmitting}>取消</Button>
            <Button onClick={handleEditSubmit} disabled={editSubmitting}>{editSubmitting ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
