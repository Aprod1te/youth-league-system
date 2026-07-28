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
  Check,
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

  // 获取用户和通知
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

      // 获取用户角色
      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .maybeSingle()

      if (profileData?.role) {
        setUserRole(profileData.role)
      }

      // 获取通知
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
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-card transition-all duration-300 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "w-16" : "w-64"}`}
      >
        <div className="flex h-14 items-center border-b px-4">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-lg">
              <LayoutDashboard className="size-5 text-primary" />
              <span>团委管理系统</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto hidden lg:flex"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft
              className={`size-4 transition-transform ${
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

        <nav className="flex-1 space-y-1 p-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${collapsed ? "justify-center px-2" : ""}`}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="size-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="border-t p-2">
          {!collapsed && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              &copy; 2026 团委管理系统
            </p>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部导航栏 */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          <div className="flex-1" />

        {/* 通知铃铛 */}
<div className="relative">
          <div
            onClick={async () => {
              if (user) await fetchNotifications(user.id)
              setNotifDropdownOpen(!notifDropdownOpen)
            }}
    className="relative inline-flex items-center justify-center rounded-full size-9 hover:bg-accent hover:text-accent-foreground cursor-pointer"
    role="button"
    aria-label="通知"
  >
    <Bell className="size-5" />
    {unreadCount > 0 && (
      <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white font-bold">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    )}
  </div>

  {notifDropdownOpen && (
    <div className="absolute right-0 top-full mt-2 w-80 rounded-md border bg-popover shadow-md z-50">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="font-medium">通知</span>
        {unreadCount > 0 && (
          <button 
            className="text-xs text-primary hover:underline"
            onClick={(e) => { e.stopPropagation(); handleMarkAllRead(); }}
          >
            全部已读
          </button>
        )}
      </div>
      
      {notifications.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          暂无通知
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`px-3 py-3 border-b last:border-0 cursor-pointer hover:bg-muted ${!notif.is_read ? "bg-muted/50" : ""}`}
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
                      );
                    });
                }
                setNotifDropdownOpen(false);
                if (notif.type === "application") router.push("/dashboard/applications");
                else if (notif.type === "activity") router.push("/dashboard/activities/approval");
                else if (notif.type === "task") router.push("/dashboard/tasks");
              }}
            >
              <p className={`text-sm ${!notif.is_read ? "font-semibold" : ""}`}>
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
      
      <div className="border-t px-3 py-2">
        <Link
          href="/dashboard/notifications"
          className="block text-center text-xs text-primary hover:underline"
          onClick={() => setNotifDropdownOpen(false)}
        >
          查看全部通知
        </Link>
      </div>
    </div>
  )}
</div>

          <span className="hidden text-sm text-muted-foreground sm:inline-block max-w-[200px] truncate">
            {user.email}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-full size-9 hover:bg-accent hover:text-accent-foreground">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  <User className="size-4" />
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{user.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/notifications")}>
                <Bell className="mr-2 size-4" />
                <span>通知中心</span>
                {unreadCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
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

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}