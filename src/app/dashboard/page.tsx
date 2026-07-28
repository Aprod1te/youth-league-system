"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  Building2,
  Bell,
  ArrowRight,
  TrendingUp,
  Clock,
  Activity,
} from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface StatsData {
  totalMembers: number
  totalDepartments: number
  totalActivities: number
  totalTasks: number
  recentActivities: any[]
  recentTasks: any[]
  notifications: any[]
}

export default function DashboardPage() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [userRole, setUserRole] = useState<string>("applicant")
  const [stats, setStats] = useState<StatsData>({
    totalMembers: 0,
    totalDepartments: 0,
    totalActivities: 0,
    totalTasks: 0,
    recentActivities: [],
    recentTasks: [],
    notifications: [],
  })
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const load = async () => {
      const supabase = supabaseRef.current
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      setUser(currentUser)

      if (currentUser) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role, department_id")
          .eq("id", currentUser.id)
          .maybeSingle()

        const role = profileData?.role || "applicant"
        setUserRole(role)

        // Load stats
        try {
          const [
            { count: memberCount },
            { count: deptCount },
            { count: activityCount },
            { count: taskCount },
            { data: activities },
            { data: tasks },
            { data: notifs },
          ] = await Promise.all([
            supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "member"),
            supabase.from("departments").select("*", { count: "exact", head: true }),
            supabase.from("activities").select("*", { count: "exact", head: true }),
            supabase.from("tasks").select("*", { count: "exact", head: true }),
            supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(5),
            supabase.from("tasks").select("*").order("created_at", { ascending: false }).limit(5),
            supabase.from("notifications").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(5),
          ])

          setStats({
            totalMembers: memberCount || 0,
            totalDepartments: deptCount || 0,
            totalActivities: activityCount || 0,
            totalTasks: taskCount || 0,
            recentActivities: activities || [],
            recentTasks: tasks || [],
            notifications: notifs || [],
          })
        } catch (err) {
          console.error("Failed to load stats:", err)
        }
      }
      setLoading(false)
    }

    load()
  }, [])

  const statCards = [
    {
      label: "团委成员",
      value: stats.totalMembers,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
      href: "/dashboard/members",
    },
    {
      label: "部门数量",
      value: stats.totalDepartments,
      icon: Building2,
      color: "text-success",
      bgColor: "bg-success/10",
      href: "/dashboard/departments",
    },
    {
      label: "活动总数",
      value: stats.totalActivities,
      icon: Calendar,
      color: "text-warning",
      bgColor: "bg-warning/10",
      href: "/dashboard/activities",
    },
    {
      label: "任务总数",
      value: stats.totalTasks,
      icon: ClipboardList,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      href: "/dashboard/tasks",
    },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="space-y-3 animate-pulse">
                  <div className="size-10 rounded-lg bg-muted" />
                  <div className="h-4 w-16 rounded bg-muted" />
                  <div className="h-8 w-12 rounded bg-muted" />
                </div>
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
        title="工作台"
        description={`欢迎回来，${user?.email || ""}`}
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-150 h-full">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className={stat.bgColor + " rounded-lg p-2.5"}>
                    <stat.icon className={"size-5 " + stat.color} />
                  </div>
                  <TrendingUp className="size-4 text-muted-foreground/40" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-semibold text-foreground mt-0.5">{stat.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent activities */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                <h3 className="text-sm font-medium">近期活动</h3>
              </div>
              <Link
                href="/dashboard/activities"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <span>查看全部</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
            {stats.recentActivities.length === 0 ? (
              <EmptyState
                title="暂无活动"
                description="还没有创建任何活动"
                action={{ label: "创建活动", href: "/dashboard/activities" }}
              />
            ) : (
              <div className="space-y-3">
                {stats.recentActivities.map((activity: any) => (
                  <Link
                    key={activity.id}
                    href={`/dashboard/activities/${activity.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.start_time
                          ? new Date(activity.start_time).toLocaleDateString("zh-CN")
                          : "未定"}
                      </p>
                    </div>
                    <StatusBadge status={activity.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent tasks */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-4 text-primary" />
                <h3 className="text-sm font-medium">近期任务</h3>
              </div>
              <Link
                href="/dashboard/tasks"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <span>查看全部</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
            {stats.recentTasks.length === 0 ? (
              <EmptyState
                title="暂无任务"
                description="还没有创建任何任务"
                action={{ label: "创建任务", href: "/dashboard/tasks" }}
              />
            ) : (
              <div className="space-y-3">
                {stats.recentTasks.map((task: any) => (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.due_date
                          ? "截止 " + new Date(task.due_date).toLocaleDateString("zh-CN")
                          : "无截止日期"}
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}