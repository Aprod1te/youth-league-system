"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Building2, Users, CheckCircle2, Clock3, Pencil, Trash2, ArrowRight } from "lucide-react"
import type { User } from "@supabase/supabase-js"

interface Department {
  id: string
  name: string
  description: string | null
  max_members: number | null
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<string>("applicant")
  const [userDepartmentId, setUserDepartmentId] = useState<string | null>(null)
  const [applicationStatusMap, setApplicationStatusMap] = useState<Record<string, string>>({})
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editMaxMembers, setEditMaxMembers] = useState("")
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingDept, setDeletingDept] = useState<Department | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

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

        const { data: deptData, error: deptError } = await supabase
          .from("departments")
          .select("id, name, description, max_members")
          .order("name")

        if (deptError) {
          setError(deptError.message)
          setLoading(false)
          return
        }

        const newDepts = (deptData || []) as Department[]
        setDepartments(newDepts)

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
          }

          const { data: appData } = await supabase
            .from("applications")
            .select("department_id, status")
            .eq("user_id", currentUser.id)

          if (appData && appData.length > 0) {
            const map: Record<string, string> = {}
            for (const app of appData) {
              const existing = map[app.department_id]
              if (!existing || app.status === "approved") {
                map[app.department_id] = app.status
              }
            }
            setApplicationStatusMap(map)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const handleApply = (dept: Department) => {
    setSelectedDept(dept)
    setReason("")
    setDialogOpen(true)
  }

  const handleSubmitApplication = async () => {
    if (!selectedDept || !user || reason.trim().length < 10) return

    setSubmitting(true)
    const supabase = supabaseRef.current
    const { error } = await supabase.from("applications").insert({
      user_id: user.id,
      department_id: selectedDept.id,
      reason: reason.trim(),
      status: "pending",
    })

    if (error) {
      toast.add({ type: "error", title: "提交失败", description: error.message })
    } else {
      setApplicationStatusMap((prev) => ({ ...prev, [selectedDept.id]: "pending" }))
      toast.add({ type: "success", title: "申请成功", description: "申请已提交，等待审核" })
      setDialogOpen(false)
    }
    setSubmitting(false)
  }

  // Edit department
  const handleEditOpen = (dept: Department) => {
    setEditingDept(dept)
    setEditName(dept.name)
    setEditDescription(dept.description || "")
    setEditMaxMembers(dept.max_members?.toString() || "50")
    setEditError(null)
    setEditDialogOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!editingDept) return
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
    const { error } = await supabase
      .from("departments")
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        max_members: maxMembersNum,
      })
      .eq("id", editingDept.id)

    if (error) {
      setEditError(error.message)
    } else {
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === editingDept.id
            ? { ...d, name: editName.trim(), description: editDescription.trim() || null, max_members: maxMembersNum }
            : d
        )
      )
      toast.add({ type: "success", title: "更新成功", description: "部门信息已更新" })
      setEditDialogOpen(false)
    }
    setEditSubmitting(false)
  }

  // Delete department
  const handleDeleteOpen = (dept: Department) => {
    setDeletingDept(dept)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingDept) return
    setDeleteSubmitting(true)
    const supabase = supabaseRef.current

    // Remove members from this department first
    await supabase
      .from("profiles")
      .update({ department_id: null, role: "applicant" })
      .eq("department_id", deletingDept.id)

    // Delete department
    const { error } = await supabase
      .from("departments")
      .delete()
      .eq("id", deletingDept.id)

    if (error) {
      toast.add({ type: "error", title: "删除失败", description: error.message })
    } else {
      setDepartments((prev) => prev.filter((d) => d.id !== deletingDept.id))
      toast.add({ type: "success", title: "删除成功", description: "部门已删除" })
      setDeleteDialogOpen(false)
    }
    setDeleteSubmitting(false)
  }

  // Check if user is the minister of a specific department
  const isMinisterOf = (deptId: string) => {
    return userDepartmentId === deptId && userRole === "minister"
  }

  const getButtonState = (deptId: string): { label: string; disabled: boolean; variant?: "default" | "outline" | "secondary"; icon?: React.ReactNode; onClick: (() => void) | undefined } => {
    if (userDepartmentId === deptId) {
      return { label: "已加入", disabled: true, variant: "secondary", icon: <CheckCircle2 className="size-4" />, onClick: undefined }
    }
    const appStatus = applicationStatusMap[deptId]
    if (appStatus === "pending") {
      return { label: "审核中", disabled: true, variant: "outline", icon: <Clock3 className="size-4" />, onClick: undefined }
    }
    return { label: "申请加入", disabled: false, variant: "outline", icon: <Users className="size-4" />, onClick: () => handleApply(departments.find((d) => d.id === deptId)!) }
  }

  const uniqueDepartments = Array.from(new Map(departments.map((d) => [d.id, d])).values())

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="部门管理" description="浏览和管理团委各部门" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3 animate-pulse">
                <div className="size-10 rounded-lg bg-muted" />
                <div className="h-5 w-24 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="部门管理"
        description="浏览和管理团委各部门，申请加入感兴趣的部门"
      />

      {error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-12 text-center">
            <Building2 className="size-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      ) : uniqueDepartments.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-12" />}
          title="暂无部门数据"
          description="系统还没有创建任何部门"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {uniqueDepartments.map((dept) => {
            const { label, disabled, variant, icon, onClick } = getButtonState(dept.id)
            const isJoined = userDepartmentId === dept.id
            const canEdit = userRole === "admin" || (userRole === "minister" && isMinisterOf(dept.id))
            const canDelete = userRole === "admin"
            return (
              <Card
                key={dept.id}
                className={`group hover:shadow-md transition-all duration-150 hover:border-primary/20 flex flex-col relative ${
                  isJoined ? "ring-1 ring-primary/30" : ""
                }`}
              >
                {/* Edit/Delete hover actions */}
                {(canEdit || canDelete) && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                    {canEdit && (
                      <button
                        className="inline-flex size-7 items-center justify-center rounded-lg bg-background border border-border hover:bg-muted hover:border-primary/30 transition-colors cursor-pointer"
                        title="编辑部门"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleEditOpen(dept)
                        }}
                      >
                        <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        className="inline-flex size-7 items-center justify-center rounded-lg bg-background border border-border hover:bg-destructive/10 hover:border-destructive/30 transition-colors cursor-pointer"
                        title="删除部门"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleDeleteOpen(dept)
                        }}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                )}

                <Link href={`/dashboard/departments/${dept.id}`} className="flex flex-col flex-1">
                  <CardHeader className="pr-16">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-11 items-center justify-center rounded-xl transition-colors ${
                        isJoined ? "bg-primary text-primary-foreground" : "bg-muted text-primary group-hover:bg-primary/10"
                      }`}>
                        <Building2 className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base group-hover:text-primary transition-colors">{dept.name}</CardTitle>
                        {isJoined && (
                          <p className="text-xs text-primary font-medium mt-0.5">已加入</p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CardDescription className="line-clamp-2">
                      {dept.description || "暂无描述"}
                    </CardDescription>
                    {dept.max_members && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Users className="size-3" />
                        <span>上限 {dept.max_members} 人</span>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex items-center gap-2">
                    <Button
                      variant={variant || "outline"}
                      className="gap-2 flex-1"
                      disabled={disabled}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onClick?.()
                      }}
                    >
                      {icon}
                      {label}
                    </Button>
                    <Link
                      href={`/dashboard/departments/${dept.id}`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent hover:bg-muted transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowRight className="size-4" />
                    </Link>
                  </CardFooter>
                </Link>
              </Card>
            )
          })}
        </div>
      )}

      {/* Apply Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申请加入部门</DialogTitle>
            <DialogDescription>
              提交申请后需等待管理员或部长审核
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <Label className="text-xs text-muted-foreground">申请部门</Label>
              <p className="text-sm font-medium mt-0.5">{selectedDept?.name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">申请理由（至少10个字）</Label>
              <Textarea
                id="reason"
                placeholder="请说明您希望加入该部门的原因..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                disabled={submitting}
              />
              {reason.trim().length > 0 && reason.trim().length < 10 && (
                <p className="text-xs text-destructive">至少需要10个字</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmitApplication} disabled={submitting || reason.trim().length < 10}>
              {submitting ? "提交中..." : "提交申请"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Department Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑部门信息</DialogTitle>
            <DialogDescription>
              修改 {editingDept?.name} 的基本信息
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">部门名称 *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="输入部门名称"
                disabled={editSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">部门描述</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="输入部门描述"
                rows={3}
                disabled={editSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-max-members">人数上限 *</Label>
              <Input
                id="edit-max-members"
                type="number"
                min="1"
                value={editMaxMembers}
                onChange={(e) => setEditMaxMembers(e.target.value)}
                placeholder="50"
                disabled={editSubmitting}
              />
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editSubmitting}>
              取消
            </Button>
            <Button onClick={handleEditSubmit} disabled={editSubmitting || !editName.trim()}>
              {editSubmitting ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="确认删除部门"
        description={`确定要删除「${deletingDept?.name}」吗？该部门的所有成员将被移出，此操作不可撤销。`}
        confirmLabel="确认删除"
        cancelLabel="取消"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteSubmitting}
      />
    </div>
  )
}