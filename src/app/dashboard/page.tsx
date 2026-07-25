"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, ClipboardList, Calendar, TrendingUp, Bell, Clock } from "lucide-react"

interface DashboardStats {
  totalMembers: number
  inProgressTasks: number
  monthlyActivities: number
  completionRate: number
  pendingApplications: number
  pendingApprovals: number
  unreadNotifications: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
      totalMembers: 0,
      inProgressTasks: 0,
      monthlyActivities: 0,
      completionRate: 0,
      pendingApplications: 0,
      pendingApprovals: 0,
      unreadNotifications: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentTasks, setRecentTasks] = useState<Array<{
    id: string
    title: string
    status: string
    deadline: string | null
  }>>([])
  const [recentActivities, setRecentActivities] = useState<Array<{
    id: string
    title: string
    status: string
  }>>([])
  const fetchedRef = useRef(false)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    const supabase = supabaseRef.current

    async function load() {
      try {
        // 1. Total members count
        const { count: memberCount } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })

        // 2. In-progress tasks count
        const { count: taskCount } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("status", "in_progress")

        // 3. Monthly activities: created this month
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const { count: activityCount } = await supabase
          .from("activities")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfMonth)

        // 4. Completion rate: completed / total tasks
        const { count: totalTasks } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })

        const { count: completedTasks } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("status", "completed")

        const rate = totalTasks && totalTasks > 0
          ? Math.round((completedTasks || 0) / totalTasks * 100)
          : 0

        // 5. Pending applications count
        const { count: pendingAppCount } = await supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")

        // 6. Pending activity approvals count
        const { count: pendingApprovalCount } = await supabase
          .from("activities")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending_approval")

        // 7. Unread notifications for current user
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        const { count: unreadCount } = currentUser
          ? await supabase
              .from("notifications")
              .select("*", { count: "exact", head: true })
              .eq("user_id", currentUser.id)
              .eq("is_read", false)
          : { count: 0 }

        setStats({
          totalMembers: memberCount ?? 0,
          inProgressTasks: taskCount ?? 0,
          monthlyActivities: activityCount ?? 0,
          completionRate: rate,
          pendingApplications: pendingAppCount ?? 0,
          pendingApprovals: pendingApprovalCount ?? 0,
          unreadNotifications: unreadCount ?? 0,
        })

        // 7. Recent 3 tasks
        const { data: recentTaskData } = await supabase
          .from("tasks")
          .select("id, title, status, deadline")
          .order("created_at", { ascending: false })
          .limit(3)

        setRecentTasks((recentTaskData || []) as Array<{
          id: string
          title: string
          status: string
          deadline: string | null
        }>)

        // 8. Recent 3 activities
        const { data: recentActivityData } = await supabase
          .from("activities")
          .select("id, title, status")
          .order("created_at", { ascending: false })
          .limit(3)

        setRecentActivities((recentActivityData || []) as Array<{
          id: string
          title: string
          status: string
        }>)
      } catch (err) {
        console.error("Dashboard load error:", err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const statItems = [
    {
      title: "在编人员",
      value: loading ? "--" : String(stats.totalMembers),
      icon: Users,
      description: "团委成员总数",
    },
    {
      title: "进行中任务",
      value: loading ? "--" : String(stats.inProgressTasks),
      icon: ClipboardList,
      description: "当前进行中的任务",
    },
    {
      title: "本月活动",
      value: loading ? "--" : String(stats.monthlyActivities),
      icon: Calendar,
      description: "本月计划活动",
    },
    {
      title: "完成率",
      value: loading ? "--" : `${stats.completionRate}%`,
      icon: TrendingUp,
      description: "任务完成率",
    },
    {
      title: "未读通知",
      value: loading ? "--" : String(stats.unreadNotifications),
      icon: Bell,
      description: stats.unreadNotifications > 0 ? `有 ${stats.unreadNotifications} 条未读` : "无新通知",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">工作台</h1>
        <p className="text-muted-foreground">
          欢迎回来，以下是系统概览。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statItems.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 待办事项 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4 text-orange-500" />
              入部待审核
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.pendingApplications === 0 ? (
              <p className="text-sm text-muted-foreground">暂无待审核的入部申请</p>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-orange-500" />
                  <p className="text-sm">
                    有 <span className="font-bold text-orange-600">{stats.pendingApplications}</span> 条入部申请等待审核
                  </p>
                </div>
                <Link href="/dashboard/applications">
                  <Badge className="cursor-pointer bg-orange-500 hover:bg-orange-600">
                    前往处理
                  </Badge>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4 text-blue-500" />
              活动待审批
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.pendingApprovals === 0 ? (
              <p className="text-sm text-muted-foreground">暂无待审批的活动</p>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-blue-500" />
                  <p className="text-sm">
                    有 <span className="font-bold text-blue-600">{stats.pendingApprovals}</span> 条活动等待审批
                  </p>
                </div>
                <Link href="/dashboard/activities/approval">
                  <Badge className="cursor-pointer bg-blue-500 hover:bg-blue-600">
                    前往处理
                  </Badge>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 最近动态 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近任务</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                暂无任务数据。请先在"任务管理"中创建任务。
              </p>
            ) : (
              <div className="space-y-3">
                {recentTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.deadline
                          ? `截止：${new Date(t.deadline).toLocaleDateString("zh-CN")}`
                          : "无截止日期"}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : t.status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : t.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {t.status === "pending"
                        ? "待处理"
                        : t.status === "in_progress"
                        ? "进行中"
                        : t.status === "completed"
                        ? "已完成"
                        : "已取消"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>近期活动</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                暂无活动数据。请先在"活动管理"中创建活动。
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : a.status === "approved"
                          ? "bg-blue-100 text-blue-700"
                          : a.status === "rejected" || a.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : a.status === "pending_approval"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {a.status === "draft"
                        ? "草稿"
                        : a.status === "pending_approval"
                        ? "待审批"
                        : a.status === "approved"
                        ? "已批准"
                        : a.status === "rejected"
                        ? "已拒绝"
                        : a.status === "completed"
                        ? "已完成"
                        : a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}