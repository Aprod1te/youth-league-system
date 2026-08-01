"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Bell,
  Check,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { toast } from "@/components/ui/toast"
import {
  getNotificationHref,
  NOTIFICATIONS_CHANGED_EVENT,
} from "@/lib/notifications"
import { createClient } from "@/lib/supabase/client"

interface Notification {
  id: string
  title: string
  content: string | null
  type: string
  related_id: string | null
  is_read: boolean
  created_at: string | null
}

const notificationColumns =
  "id, title, content, type, related_id, is_read, created_at"

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    id: string
    kind: "read" | "delete"
  } | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const supabaseRef = useRef(createClient())
  const userIdRef = useRef<string | null>(null)

  const loadNotifications = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setLoadError(null)

    const supabase = supabaseRef.current
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      setLoadError(authError?.message || "登录状态已失效，请重新登录")
      setLoading(false)
      return
    }

    userIdRef.current = user.id
    const { data, error } = await supabase
      .from("notifications")
      .select(notificationColumns)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setLoadError(error.message)
    } else {
      setNotifications(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadNotifications()
    }, 0)

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications(false)
      }
    }

    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [loadNotifications])

  const markAsRead = async (id: string) => {
    const userId = userIdRef.current
    if (!userId || pendingAction || markingAll) return

    setPendingAction({ id, kind: "read" })
    const { data, error } = await supabaseRef.current
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle()

    if (error || !data) {
      toast.add({
        type: "error",
        title: "标记失败",
        description: error?.message || "通知不存在或已被删除",
      })
    } else {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? { ...notification, is_read: true }
            : notification
        )
      )
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
    }
    setPendingAction(null)
  }

  const markAllAsRead = async () => {
    const userId = userIdRef.current
    if (!userId || pendingAction || markingAll) return

    setMarkingAll(true)
    const { error } = await supabaseRef.current
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false)

    if (error) {
      toast.add({
        type: "error",
        title: "标记失败",
        description: error.message,
      })
    } else {
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, is_read: true }))
      )
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
      toast.add({ type: "success", title: "已全部标记为已读" })
    }
    setMarkingAll(false)
  }

  const deleteNotification = async (id: string) => {
    const userId = userIdRef.current
    if (!userId || pendingAction || markingAll) return

    setPendingAction({ id, kind: "delete" })
    const { data, error } = await supabaseRef.current
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle()

    if (error || !data) {
      toast.add({
        type: "error",
        title: "删除失败",
        description: error?.message || "通知不存在或已被删除",
      })
    } else {
      setNotifications((current) =>
        current.filter((notification) => notification.id !== id)
      )
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
      toast.add({ type: "success", title: "通知已删除" })
    }
    setPendingAction(null)
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="正在加载通知">
        <PageHeader title="通知中心" description="查看审批、任务和活动动态" />
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知中心"
        description="查看审批、任务和活动动态"
        actions={
          notifications.some((notification) => !notification.is_read) ? (
            <Button
              onClick={() => void markAllAsRead()}
              variant="outline"
              size="sm"
              disabled={markingAll || pendingAction !== null}
            >
              {markingAll ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}
              全部已读
            </Button>
          ) : undefined
        }
      />

      {loadError ? (
        <EmptyState
          icon={<TriangleAlert className="size-12 text-destructive" />}
          title="通知加载失败"
          description={loadError}
          action={{
            label: "重新加载",
            onClick: () => void loadNotifications(),
          }}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-12" />}
          title="暂无通知"
          description="新的审批结果和工作动态会显示在这里"
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const href = getNotificationHref(
              notification.type,
              notification.related_id
            )
            const isPending = pendingAction?.id === notification.id
            const isMarkingRead = isPending && pendingAction.kind === "read"
            const isDeleting = isPending && pendingAction.kind === "delete"
            const content = (
              <>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2
                    className={notification.is_read ? "font-medium" : "font-semibold"}
                  >
                    {notification.title}
                  </h2>
                  {!notification.is_read && (
                    <Badge variant="destructive">未读</Badge>
                  )}
                </div>
                {notification.content && (
                  <p className="text-sm text-muted-foreground">
                    {notification.content}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {notification.created_at
                    ? new Date(notification.created_at).toLocaleString("zh-CN")
                    : "时间未知"}
                </p>
              </>
            )

            return (
              <Card
                key={notification.id}
                className={notification.is_read ? "rounded-lg opacity-70" : "rounded-lg"}
              >
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {href ? (
                    <Link
                      href={href}
                      className="group min-w-0 flex-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => {
                        if (!notification.is_read) {
                          void markAsRead(notification.id)
                        }
                      }}
                    >
                      {content}
                      <span className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
                        查看详情
                        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  ) : (
                    <div className="min-w-0 flex-1">{content}</div>
                  )}

                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void markAsRead(notification.id)}
                        disabled={isPending || markingAll}
                        aria-label={`将“${notification.title}”标记为已读`}
                        title="标记为已读"
                      >
                        {isMarkingRead ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Check />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void deleteNotification(notification.id)}
                      disabled={isPending || markingAll}
                      aria-label={`删除“${notification.title}”`}
                      title="删除通知"
                    >
                      {isDeleting ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loadError && notifications.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void loadNotifications(false)}
          className="text-muted-foreground"
        >
          <RefreshCw />
          刷新通知
        </Button>
      )}
    </div>
  )
}
