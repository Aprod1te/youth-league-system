"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/toast"
import { ArrowLeft, Bell, CheckCheck, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const didFetch = useRef(false)

  const loadNotifications = async () => {
    const supabase = supabaseRef.current
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) return
    setUser(currentUser)

    const { data, error: fetchError } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    setNotifications(data as Notification[])
  }

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    async function load() {
      try {
        setLoading(true)
        await loadNotifications()
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const handleMarkAllRead = async () => {
    if (!user) return
    setActionLoading(true)
    const supabase = supabaseRef.current

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)

    if (updateError) {
      toast.add({
        type: "error",
        title: "操作失败",
        description: updateError.message,
      })
      setActionLoading(false)
      return
    }

    toast.add({
      type: "success",
      title: "全部已读",
      description: "所有通知已标记为已读",
    })

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setActionLoading(false)
  }

  const handleMarkAsRead = async (notifId: string) => {
    const supabase = supabaseRef.current
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notifId)

    if (!updateError) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      )
    }
  }

  const handleDelete = async (notifId: string) => {
    const supabase = supabaseRef.current
    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notifId)

    if (deleteError) {
      toast.add({
        type: "error",
        title: "删除失败",
        description: deleteError.message,
      })
      return
    }

    toast.add({
      type: "success",
      title: "已删除",
      description: "通知已删除",
    })

    setNotifications((prev) => prev.filter((n) => n.id !== notifId))
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">通知中心</h1>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={actionLoading}
          >
            <CheckCheck className="mr-1.5 size-4" />
            全部已读 ({unreadCount})
          </Button>
        )}
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
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="mx-auto size-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">暂无通知</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                !notif.is_read ? "border-l-4 border-l-primary" : ""
              }`}
              onClick={() => handleMarkAsRead(notif.id)}
            >
              <CardContent className="flex items-start justify-between py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {!notif.is_read && (
                      <Badge variant="default" className="text-xs">
                        未读
                      </Badge>
                    )}
                    <h3
                      className={`text-sm font-medium ${
                        !notif.is_read ? "font-bold" : ""
                      }`}
                    >
                      {notif.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{notif.content}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(notif.created_at).toLocaleString("zh-CN")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(notif.id)
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}