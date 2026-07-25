"use client"

import { useEffect, useState, useRef } from "react"
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
import { Plus } from "lucide-react"
import type { User } from "@supabase/supabase-js"

interface Task {
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

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
]

const priorityOptions = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
]

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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([])
  const [filterStatus, setFilterStatus] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})

  // Create task dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newAssignedTo, setNewAssignedTo] = useState("")
  const [newPriority, setNewPriority] = useState("medium")
  const [newDueDate, setNewDueDate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const didFetch = useRef(false)
  const supabaseRef = useRef(createClient())

  const loadTasks = async () => {
    const supabase = supabaseRef.current

    // Step 1: Fetch tasks
    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })

    if (taskError) {
      setError(taskError.message)
      return
    }

    const tasksList = (taskData || []) as unknown as Task[]
    setTasks(tasksList)
    setFilteredTasks(tasksList)

    // Step 2: Fetch all profiles
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name")

    const profilesList = (profileData || []) as ProfileOption[]
    setProfiles(profilesList)

    // Step 3: Build name map
    const map: Record<string, string> = {}
    for (const p of profilesList) {
      map[p.id] = p.full_name || p.id
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
        await loadTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  useEffect(() => {
    if (filterStatus === "all") {
      setFilteredTasks(tasks)
    } else {
      setFilteredTasks(tasks.filter((t) => t.status === filterStatus))
    }
  }, [filterStatus, tasks])

  const getAssignName = (userId: string | null) => {
    if (!userId) return "-"
    return userNameMap[userId] || userId
  }

  const getCreatorName = (userId: string) => {
    return userNameMap[userId] || userId
  }

  const handleCreateTask = async () => {
    if (!user || !newTitle.trim()) return

    setSubmitting(true)
    const supabase = supabaseRef.current

    const { error: insertError } = await supabase.from("tasks").insert({
      title: newTitle.trim(),
      description: newDescription.trim() || null,
      assigned_to: newAssignedTo || null,
      priority: newPriority,
      deadline: newDueDate || null,
      created_by: user.id,
      status: "pending",
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

    // Create notification for the assigned user
    if (newAssignedTo) {
      // Fetch the just-created task to get its ID
      const { data: createdTasks } = await supabase
        .from("tasks")
        .select("id")
        .eq("title", newTitle.trim())
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(1)

      const newTaskId = createdTasks && createdTasks.length > 0 ? createdTasks[0].id : null

      await supabase.from("notifications").insert({
        user_id: newAssignedTo,
        title: "新任务分配",
        content: `你有一个新任务：「${newTitle.trim()}」`,
        type: "task_assigned",
        related_id: newTaskId,
        is_read: false,
      })
    }

    toast.add({
      type: "success",
      title: "创建成功",
      description: "任务已创建",
    })

    // Refresh task list
    await loadTasks()

    // Reset form
    setNewTitle("")
    setNewDescription("")
    setNewAssignedTo("")
    setNewPriority("medium")
    setNewDueDate("")
    setDialogOpen(false)
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">任务管理</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">状态筛选：</span>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value ?? "all")}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            新建任务
          </Button>
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
      ) : filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {filterStatus !== "all" ? "没有匹配该状态的任务" : "暂无任务数据"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务标题</TableHead>
                <TableHead>负责人</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>截止日期</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/tasks/${task.id}`}
                      className="text-primary hover:underline"
                    >
                      {task.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {getAssignName(task.assigned_to)}
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
                    <Badge variant={statusBadgeVariant[task.status] || "outline"}>
                      {statusLabel[task.status] || task.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
            <DialogDescription>
              创建一个新任务并分配给团队成员
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">任务标题</Label>
              <Input
                id="title"
                placeholder="请输入任务标题"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">任务描述</Label>
              <Textarea
                id="description"
                placeholder="请输入任务描述"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label>负责人</Label>
              <Select value={newAssignedTo} onValueChange={(value) => setNewAssignedTo(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">未分配</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select value={newPriority} onValueChange={(value) => setNewPriority(value ?? "medium")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">截止日期</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
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
              onClick={handleCreateTask}
              disabled={submitting || !newTitle.trim()}
            >
              {submitting ? "创建中..." : "创建任务"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}