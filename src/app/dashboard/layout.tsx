"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Calendar,
  Building2,
  LogOut,
  Menu,
  X,
  User,
  ChevronLeft,
  Bell,
  Archive,
} from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface Notification {
  id: string
  title: string
  content: string
  type: string
  related_id: string | null
  is_read: boolean
  created_at: string
}

const allNavigation = [
  { name: "工作台", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "minister", "member", "applicant"] },
  { name: "部门管理", href: "/dashboard/departments", icon: Building2, roles: ["admin", "minister", "member", "applicant"] },
  { name: "人员管理", href: "/dashboard/members", icon: Users, roles: ["admin", "minister", "member"] },
  { name: "任务管理", href: "/dashboard/tasks", icon: ClipboardList, roles: ["admin", "minister", "member"] },
  { name: "活动管理", href: "/dashboard/activities", icon: Calendar, roles: ["admin", "minister", "member", "applicant"] },
  { name: "活动审批", href: "/dashboard/activities/approval", icon: Calendar, roles: ["admin", "minister"] },
  { name: "入部审核", href: "/dashboard/applications", icon: ClipboardList, roles: ["admin", "minister"] },
  { name: "活动归档", href: "/dashboard/archive", icon: Archive, roles: ["admin", "minister", "member", "applicant"] },
]

const roleLabel: Record<string, string> = {
  admin: "管理员",
  minister: "部长",
  member: "成员",
  applicant: "申请者",
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [userRole, setUserRole] = useState<string>("applicant")
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)

  const pathname = usePathname()
  const router = useRouter()
  const supabaseRef = useRef(createClient())

  const unreadCount = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    const supabase = supabaseRef.current

    const getUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        router.push("/login")
        return
      }

      setUser(currentUser)

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .maybeSingle()

      if (profileData?.role) {
        setUserRole(profileData.role)
      }

      await fetchNotifications(currentUser.id)
      setLoading(false)
    }

    getUser()

    const interval = setInterval(() => {
      supabaseRef.current.auth.getUser().then(({ data: { user: currentUser } }) => {
        if (currentUser) fetchNotifications(currentUser.id)
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [router])

  const fetchNotifications = async (userId: string) => {
    const supabase = supabaseRef.current
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5)

    if (data) {
      setNotifications(data as Notification[])
    }
  }

  const handleMarkAllRead = async () => {
    if (!user || unreadCount === 0) return
    const supabase = supabaseRef.current

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const handleSignOut = async () => {
    const supabase = supabaseRef.current
    await supabase.auth.signOut()
    router.push("/login")
  }

  const navigation = allNavigation.filter((item) => item.roles.includes(userRole))

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="size-10 rounded-lg bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-150 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "w-16" : "w-64"}`}
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2 font-medium text-base">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
                <LayoutDashboard className="size-4 text-primary-foreground" />
              </div>
              <span className="text-foreground">团委管理系统</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`ml-auto hidden lg:flex ${collapsed ? "mx-auto" : ""}`}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft
              className={`size-4 transition-transform duration-150 ${
                collapsed ? "rotate-180" : ""
              }`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 relative ${
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                } ${collapsed ? "justify-center px-2" : ""}`}
                title={collapsed ? item.name : undefined}
              >
                {/* Active indicator line */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" />
                )}
                <item.icon className="size-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3">
          {!collapsed && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              &copy; 2026 团委管理系统
            </p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          <div className="flex-1" />

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={async () => {
                if (user) await fetchNotifications(user.id)
                setNotifDropdownOpen(!notifDropdownOpen)
              }}
              className="relative inline-flex items-center justify-center rounded-lg size-9 hover:bg-muted hover:text-foreground transition-all duration-150 cursor-pointer"
              aria-label="通知"
            >
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-white font-medium">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {notifDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNotifDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover shadow-md z-50 animate-fade-in">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="text-sm font-medium">通知</span>
                    {unreadCount > 0 && (
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMarkAllRead()
                        }}
                      >
                        全部已读
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      暂无通知
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`px-4 py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                            !notif.is_read ? "bg-muted/30" : ""
                          }`}
                          onClick={() => {
                            if (!notif.is_read && user) {
                              supabaseRef.current
                                .from("notifications")
                                .update({ is_read: true })
                                .eq("id", notif.id)
                                .then(() => {
                                  setNotifications((prev) =>
                                    prev.map((n) =>
                                      n.id === notif.id ? { ...n, is_read: true } : n
                                    )
                                  )
                                })
                            }
                            setNotifDropdownOpen(false)
                            if (notif.type === "application") router.push("/dashboard/applications")
                            else if (notif.type === "activity") router.push("/dashboard/activities/approval")
                            else if (notif.type === "task") router.push("/dashboard/tasks")
                          }}
                        >
                          {/* Unread indicator dot */}
                          {!notif.is_read && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-2 align-middle" />
                          )}
                          <p className={`text-sm ${!notif.is_read ? "font-medium" : ""}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {notif.content}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(notif.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-border px-4 py-2">
                    <Link
                      href="/dashboard/notifications"
                      className="block text-center text-xs text-primary hover:underline"
                      onClick={() => setNotifDropdownOpen(false)}
                    >
                      查看全部通知
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>

          <span className="hidden text-sm text-muted-foreground sm:inline-block max-w-[200px] truncate">
            {user.email}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg size-9 hover:bg-muted hover:text-foreground transition-all duration-150 cursor-pointer">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  <User className="size-4" />
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-3 py-2">
                <p className="text-sm font-medium truncate">{user.email}</p>
                <p className="text-xs text-muted-foreground">{roleLabel[userRole] || userRole}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/notifications")}>
                <Bell className="mr-2 size-4" />
                <span>通知中心</span>
                {unreadCount > 0 && (
                  <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 size-4" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}