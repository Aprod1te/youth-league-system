"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import { Building2 } from "lucide-react"
import type { User } from "@supabase/supabase-js"

interface Department {
  id: string
  name: string
  description: string | null
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  // userDepartmentId: the department_id from profiles (most accurate — set after approval)
  const [userDepartmentId, setUserDepartmentId] = useState<string | null>(null)
  // applicationStatusMap: department_id -> application status (pending/approved/rejected)
  const [applicationStatusMap, setApplicationStatusMap] = useState<Record<string, string>>({})
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
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
          .select("id, name, description")
          .order("name")

        if (deptError) {
          setError(deptError.message)
          setLoading(false)
          return
        }

        const newDepts = (deptData || []) as Department[]
        setDepartments(newDepts)

        if (currentUser) {
          // 1) Fetch user's current department_id from profiles (most accurate)
          const { data: profileData } = await supabase
            .from("profiles")
            .select("department_id")
            .eq("id", currentUser.id)
            .maybeSingle()

          if (profileData?.department_id) {
            setUserDepartmentId(profileData.department_id)
          }

          // 2) Fetch all applications for this user to determine per-department status
          const { data: appData } = await supabase
            .from("applications")
            .select("department_id, status")
            .eq("user_id", currentUser.id)

          if (appData && appData.length > 0) {
            const map: Record<string, string> = {}
            for (const app of appData) {
              // Keep the most recent/approved status per department
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
      toast.add({
        type: "error",
        title: "提交失败",
        description: error.message,
      })
    } else {
      setApplicationStatusMap((prev) => ({ ...prev, [selectedDept.id]: "pending" }))
      toast.add({
        type: "success",
        title: "申请成功",
        description: "申请已提交，等待审核",
      })
      setDialogOpen(false)
    }
    setSubmitting(false)
  }

  const getButtonState = (deptId: string): { label: string; disabled: boolean; onClick: (() => void) | undefined } => {
    // Priority 1: profiles.department_id matches → already a member
    if (userDepartmentId === deptId) {
      return { label: "已加入", disabled: true, onClick: undefined }
    }

    // Priority 2: Check application status for this department
    const appStatus = applicationStatusMap[deptId]
    if (appStatus === "pending") {
      return { label: "审核中", disabled: true, onClick: undefined }
    }

    // Priority 3: No application or rejected → can apply
    return { label: "申请加入", disabled: false, onClick: () => handleApply(departments.find((d) => d.id === deptId)!) }
  }

  // De-duplicate by id — ensures each department renders only once
  const uniqueDepartments = Array.from(
    new Map(departments.map((d) => [d.id, d])).values()
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">部门管理</h1>

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
      ) : uniqueDepartments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">暂无部门数据</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {uniqueDepartments.map((dept) => {
            const { label, disabled, onClick } = getButtonState(dept.id)
            return (
              <Card key={dept.id} className="hover:shadow-md transition-shadow flex flex-col">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="size-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{dept.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <CardDescription>
                    {dept.description || "暂无描述"}
                  </CardDescription>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={disabled}
                    onClick={onClick}
                  >
                    {label}
                  </Button>
                </CardFooter>
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
              提交申请后需等待管理员审核
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>申请部门</Label>
              <p className="text-sm font-medium">{selectedDept?.name}</p>
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
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              onClick={handleSubmitApplication}
              disabled={submitting || reason.trim().length < 10}
            >
              {submitting ? "提交中..." : "提交申请"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}