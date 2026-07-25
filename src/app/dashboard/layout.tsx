"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  { name: "人员管理", href: "/dashboard/members", icon: Users, roles: ["admin", "minister"] },
  { name: "任务管理", href: "/dashboard/tasks", icon: ClipboardList, roles: ["admin", "minister", "member"] },
  { name: "活动管理", href: "/dashboard/activities", icon: Calendar, roles: ["admin", "minister", "member", "applicant"] },
  { name: "活动审批", href: "/dashboard/activities/approval", icon: Calendar, roles: ["admin", "minister"] },
  { name: "入部审核", href: "/dashboard/applications", icon: ClipboardList, roles: ["admin", "minister"] },
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
  const pathname = usePathname()
  const router = useRouter()
  const supabaseRef = useRef(createClient())

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)

  const fetchNotifications = async () => {
    if (!user) return
    const supabase = supabaseRef.current
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)

    if (data) {
      setNotifications(data as Notification[])
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    const supabase = supabaseRef.current

    const getUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      if (!currentUser) {
        router.push("/login")
      } else {
        setUser(currentUser)

        // Fetch user role from profiles
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUser.id)
          .maybeSingle()

        if (profileData?.role) {
          setUserRole(profileData.role)
        }

        // Fetch notifications
        const { data: notifData } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: false })
          .limit(5)

        if (notifData) {
          setNotifications(notifData as Notification[])
        }
      }
      setLoading(false)
    }
    getUser()
  }, [router])

  const handleSignOut = async () => {
    const supabase = supabaseRef.current
    await supabase.auth.signOut()
    router.refresh()
    router.push("/login")
  }

  const handleMarkAsRead = async (notifId: string) => {
    const supabase = supabaseRef.current
    await supabase.from("notifications").update({ is_read: true }).eq("id", notifId)
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    )
  }

  const navigation = allNavigation.filter((item) => item.roles.includes(userRole))

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar backdrop on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-card transition-all duration-300 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "w-16" : "w-64"}`}
      >
        {/* Sidebar header */}
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

        {/* Navigation */}
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

        {/* Sidebar footer */}
        <div className="border-t p-2">
          {!collapsed && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              &copy; 2026 团委管理系统
            </p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
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

          {/* Notification Bell */}
          <button
            onClick={() => window.location.href = '/dashboard/notifications'}
            className="relative rounded-full hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center size-9"
            aria-label="通知"
          >
            <Bell className="size-5" />
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
              {unreadCount > 9 ? "9+" : unreadCount || ""}
            </span>
          </button>

          <span className="hidden text-sm text-muted-foreground sm:inline-block">
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
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 size-4" />
                <span>个人设置</span>
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}