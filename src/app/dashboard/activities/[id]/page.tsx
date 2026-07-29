"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Users, Upload, X, Download, ImagePlus, FileText, CheckSquare } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface ActivityDetail {
  id: string
  title: string
  description: string | null
  location: string | null
  start_time: string | null
  end_time: string | null
  budget: number | null
  organizer_id: string
  department_id: string | null
  status: string
  max_participants: number | null
  created_at: string
}

interface ActivityReport {
  id: string
  activity_id: string
  summary: string | null
  photos: string[] | null
  attachments: string[] | null
  participant_count: number | null
  submitted_by: string
  created_at: string
}

interface ProfileOption {
  id: string
  full_name: string | null
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_approval: "default",
  approved: "outline",
  rejected: "destructive",
  completed: "outline",
}

const statusLabel: Record<string, string> = {
  draft: "草稿",
  pending_approval: "待审批",
  approved: "已批准",
  rejected: "已拒绝",
  completed: "已完成",
}

const MAX_PHOTOS = 5
const MAX_DOCS = 3
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const ACCEPTED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

export default function ActivityDetailPage() {
  const params = useParams()
  const router = useRouter()
  const activityId = params.id as string

  const [activity, setActivity] = useState<ActivityDetail | null>(null)
  const [activityReport, setActivityReport] = useState<ActivityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [summary, setSummary] = useState("")
  const [participantCount, setParticipantCount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Photo upload state
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])

  // Document upload state
  const [docFiles, setDocFiles] = useState<File[]>([])

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState("")

  // Check-in state
  const [myCheckin, setMyCheckin] = useState<{ id: string } | null>(null)
  const [checkinCount, setCheckinCount] = useState(0)
  const [checkinUsers, setCheckinUsers] = useState<Array<{ id: string; full_name: string | null }>>([])
  const [checkinActionLoading, setCheckinActionLoading] = useState(false)

  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})
  const [userRsvp, setUserRsvp] = useState<{ id: string; status: string } | null>(null)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [rsvpUsers, setRsvpUsers] = useState<Array<{ id: string; full_name: string | null; status: string }>>([])
  const [rsvpActionLoading, setRsvpActionLoading] = useState(false)
  const didFetch = useRef(false)
  const supabaseRef = useRef(createClient())
  const photoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    const supabase = supabaseRef.current

    async function load() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        setUser(currentUser)

        // Step 1: Fetch the activity
        const { data: activityData, error: activityError } = await supabase
          .from("activities")
          .select("*")
          .eq("id", activityId)
          .single()

        if (activityError) {
          setError(activityError.message)
          return
        }

        const singleActivity = activityData as unknown as ActivityDetail
        setActivity(singleActivity)

        // Step 2: Fetch the activity report (if exists)
        const { data: reportData } = await supabase
          .from("activity_reports")
          .select("*")
          .eq("activity_id", activityId)
          .order("created_at", { ascending: false })
          .limit(1)

        if (reportData && reportData.length > 0) {
          setActivityReport(reportData[0] as ActivityReport)
        }

        // Step 3: Fetch profiles to build name map
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name")

        const profilesList = (profileData || []) as ProfileOption[]
        const map: Record<string, string> = {}
        for (const p of profilesList) {
          map[p.id] = p.full_name || p.id
        }
        setUserNameMap(map)

        // Step 4: Fetch RSVPs for this activity
        const { data: rsvpData } = await supabase
          .from("activity_rsvps")
          .select("id, user_id, status")
          .eq("activity_id", activityId)

        const rsvpList = (rsvpData || []) as Array<{ id: string; user_id: string; status: string }>
        setRsvpCount(rsvpList.filter((r) => r.status === "registered").length)
        setRsvpUsers(
          rsvpList.map((r) => ({
            id: r.user_id,
            full_name: map[r.user_id] || r.user_id,
            status: r.status,
          }))
        )

        if (currentUser) {
          const myRsvp = rsvpList.find((r) => r.user_id === currentUser.id)
          setUserRsvp(myRsvp ? { id: myRsvp.id, status: myRsvp.status } : null)
        }

        // Step 5: Fetch check-in data for this activity
        const { data: checkinData } = await supabase
          .from("activity_checkins")
          .select("id, user_id")
          .eq("activity_id", activityId)

        const checkinList = (checkinData || []) as Array<{ id: string; user_id: string }>
        setCheckinCount(checkinList.length)
        setCheckinUsers(
          checkinList.map((c) => ({
            id: c.user_id,
            full_name: map[c.user_id] || c.user_id,
          }))
        )

        if (currentUser) {
          const myC = checkinList.find((c) => c.user_id === currentUser.id)
          setMyCheckin(myC ? { id: myC.id } : null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [activityId])

  // Cleanup photo preview URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of photoPreviews) {
        URL.revokeObjectURL(url)
      }
    }
  }, [photoPreviews])

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const remaining = MAX_PHOTOS - photoFiles.length
    if (remaining <= 0) {
      toast.add({ type: "error", title: "照片数量已达上限", description: `最多上传${MAX_PHOTOS}张照片` })
      return
    }

    const selected = Array.from(files).slice(0, remaining)
    const validFiles: File[] = []
    const invalidNames: string[] = []

    for (const file of selected) {
      if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        validFiles.push(file)
      } else {
        invalidNames.push(file.name)
      }
    }

    if (invalidNames.length > 0) {
      toast.add({
        type: "error",
        title: "不支持的文件类型",
        description: `${invalidNames.join(", ")} 不是支持的图片格式`,
      })
    }

    if (validFiles.length === 0) return

    const newPreviews = validFiles.map((f) => URL.createObjectURL(f))
    setPhotoFiles((prev) => [...prev, ...validFiles].slice(0, MAX_PHOTOS))
    setPhotoPreviews((prev) => [...prev, ...newPreviews].slice(0, MAX_PHOTOS))
  }, [photoFiles.length])

  const removePhoto = useCallback((index: number) => {
    setPhotoFiles((prev) => {
      const updated = [...prev]
      updated.splice(index, 1)
      return updated
    })
    setPhotoPreviews((prev) => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed)
      const updated = [...prev]
      updated.splice(index, 1)
      return updated
    })
  }, [])

  const handleDocSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const remaining = MAX_DOCS - docFiles.length
    if (remaining <= 0) {
      toast.add({ type: "error", title: "文档数量已达上限", description: `最多上传${MAX_DOCS}个文档` })
      return
    }

    const selected = Array.from(files).slice(0, remaining)
    const validFiles: File[] = []
    const invalidNames: string[] = []

    for (const file of selected) {
      if (ACCEPTED_DOC_TYPES.includes(file.type)) {
        validFiles.push(file)
      } else {
        invalidNames.push(file.name)
      }
    }

    if (invalidNames.length > 0) {
      toast.add({
        type: "error",
        title: "不支持的文件类型",
        description: `${invalidNames.join(", ")} 不是支持的文档格式（仅支持 PDF、DOC、DOCX）`,
      })
    }

    if (validFiles.length === 0) return

    setDocFiles((prev) => [...prev, ...validFiles].slice(0, MAX_DOCS))
  }, [docFiles.length])

  const removeDoc = useCallback((index: number) => {
    setDocFiles((prev) => {
      const updated = [...prev]
      updated.splice(index, 1)
      return updated
    })
  }, [])

  const uploadFiles = async (files: File[], bucket: string, prefix: string): Promise<string[]> => {
    const supabase = supabaseRef.current
    const urls: string[] = []

    for (const file of files) {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")
      const filePath = `${prefix}/${safeName}_${timestamp}`

      const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      })

      if (error) {
        toast.add({
          type: "error",
          title: "文件上传失败",
          description: `${file.name}: ${error.message}`,
        })
        continue
      }

      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath)
      if (publicData?.publicUrl) {
        urls.push(publicData.publicUrl)
      }
    }

    return urls
  }

  const handleSubmitSummary = async () => {
    if (!user || !activity || !summary.trim()) return

    setSubmitting(true)
    const supabase = supabaseRef.current

    // Upload photos
    let photoUrls: string[] = []
    if (photoFiles.length > 0) {
      photoUrls = await uploadFiles(photoFiles, "activity-photos", activityId)
    }

    // Upload documents
    let docUrls: string[] = []
    if (docFiles.length > 0) {
      docUrls = await uploadFiles(docFiles, "activity-documents", activityId)
    }

    const { error: submitError } = await supabase.from("activity_reports").insert({
      activity_id: activity.id,
      summary: summary.trim(),
      participant_count: parseInt(participantCount) || 0,
      submitted_by: user.id,
      photos: photoUrls,
      attachments: docUrls,
    })

    if (submitError) {
      toast.add({
        type: "error",
        title: "提交失败",
        description: submitError.message,
      })
      setSubmitting(false)
      return
    }

    toast.add({
      type: "success",
      title: "提交成功",
      description: "活动总结已提交",
    })

    // Reset form state
    setSummary("")
    setParticipantCount("")
    setPhotoFiles([])
    setPhotoPreviews([])
    setDocFiles([])
    setSubmitting(false)

    // Refresh the page to show updated report
    window.location.reload()
  }

  const getOrganizerName = (userId: string) => {
    return userNameMap[userId] || userId
  }

  const getFileNameFromUrl = (url: string) => {
    try {
      const pathname = new URL(url).pathname
      const segments = pathname.split("/")
      const rawName = segments[segments.length - 1] || ""
      // Remove timestamp suffix (_xxxxx)
      const underscoreIdx = rawName.lastIndexOf("_")
      return underscoreIdx > 0 ? rawName.substring(0, underscoreIdx) : rawName
    } catch {
      return url
    }
  }

  const handleRegister = async () => {
    if (!user || !activity) return
    setRsvpActionLoading(true)
    const supabase = supabaseRef.current

    if (userRsvp && userRsvp.status === "cancelled") {
      // Re-register: update the existing cancelled RSVP
      const { error } = await supabase
        .from("activity_rsvps")
        .update({ status: "registered" })
        .eq("id", userRsvp.id)

      if (error) {
        toast.add({ type: "error", title: "报名失败", description: error.message })
        setRsvpActionLoading(false)
        return
      }

      toast.add({ type: "success", title: "报名成功" })
      setUserRsvp({ id: userRsvp.id, status: "registered" })
      setRsvpCount((prev) => prev + 1)
      setRsvpUsers((prev) =>
        prev.map((u) => (u.id === user!.id ? { ...u, status: "registered" } : u))
      )
    } else {
      // New registration
      const { data, error } = await supabase
        .from("activity_rsvps")
        .insert({ activity_id: activity.id, user_id: user.id, status: "registered" })
        .select()
        .single()

      if (error) {
        toast.add({ type: "error", title: "报名失败", description: error.message })
        setRsvpActionLoading(false)
        return
      }

      toast.add({ type: "success", title: "报名成功" })
      setUserRsvp({ id: data.id, status: "registered" })
      setRsvpCount((prev) => prev + 1)
      setRsvpUsers((prev) => [
        ...prev,
        { id: user!.id, full_name: userNameMap[user!.id] || user!.id, status: "registered" },
      ])
    }

    setRsvpActionLoading(false)
  }

  const handleCancelRegistration = async () => {
    if (!userRsvp) return
    setRsvpActionLoading(true)
    const supabase = supabaseRef.current

    const { error } = await supabase
      .from("activity_rsvps")
      .update({ status: "cancelled" })
      .eq("id", userRsvp.id)

    if (error) {
      toast.add({ type: "error", title: "取消报名失败", description: error.message })
      setRsvpActionLoading(false)
      return
    }

    toast.add({ type: "success", title: "已取消报名" })
    setUserRsvp((prev) => (prev ? { ...prev, status: "cancelled" } : null))
    setRsvpCount((prev) => Math.max(0, prev - 1))
    setRsvpUsers((prev) =>
      prev.map((u) => (u.id === user!.id ? { ...u, status: "cancelled" } : u))
    )
    setRsvpActionLoading(false)
  }

  const handleCheckin = async () => {
    if (!user || !activity) return
    setCheckinActionLoading(true)
    const supabase = supabaseRef.current

    const { error } = await supabase
      .from("activity_checkins")
      .insert({ activity_id: activity.id, user_id: user.id })

    if (error) {
      toast.add({ type: "error", title: "签到失败", description: error.message })
      setCheckinActionLoading(false)
      return
    }

    toast.add({ type: "success", title: "签到成功" })
    setMyCheckin({ id: "temp" })
    setCheckinCount((prev) => prev + 1)
    setCheckinUsers((prev) => [
      ...prev,
      { id: user.id, full_name: userNameMap[user.id] || user.id },
    ])
    setCheckinActionLoading(false)
  }

  const showSummarySection = activity && activity.status === "completed"
  const hasSummary = activityReport?.summary && activityReport.summary.trim().length > 0

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()} className="w-fit">
        <ArrowLeft className="mr-1.5 size-4" />
        返回活动列表
      </Button>

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
      ) : activity ? (
        <>
          {/* Activity Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{activity.title}</CardTitle>
                  <CardDescription className="mt-1">
                    创建时间：{new Date(activity.created_at).toLocaleDateString("zh-CN")}
                  </CardDescription>
                </div>
                <Badge variant={statusBadgeVariant[activity.status] || "outline"} className="text-sm">
                  {statusLabel[activity.status] || activity.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">活动描述</h3>
                <p className="text-sm">{activity.description || "暂无描述"}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">地点：</span>
                  <span>{activity.location || "未设置"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">组织者：</span>
                  <span>{getOrganizerName(activity.organizer_id)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">开始时间：</span>
                  <span>
                    {activity.start_time
                      ? new Date(activity.start_time).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "未设置"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">结束时间：</span>
                  <span>
                    {activity.end_time
                      ? new Date(activity.end_time).toLocaleDateString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "未设置"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">预算：</span>
                  <span>
                    {activity.budget != null
                      ? `¥${activity.budget.toLocaleString("zh-CN")}`
                      : "未设置"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">最大参与人数：</span>
                  <span>
                    {activity.max_participants != null
                      ? `${activity.max_participants} 人`
                      : "未限制"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Registration Section */}
          {activity && activity.status !== "draft" && activity.status !== "rejected" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  活动报名
                </CardTitle>
                <CardDescription>
                  当前报名 {rsvpCount} 人
                  {activity.max_participants != null &&
                    ` / 上限 ${activity.max_participants} 人`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {userRsvp?.status === "registered" ? (
                      <span className="font-medium text-green-600">✓ 已报名</span>
                    ) : userRsvp?.status === "cancelled" ? (
                      <span className="text-muted-foreground">已取消报名</span>
                    ) : (
                      <span className="text-muted-foreground">尚未报名</span>
                    )}
                  </div>

                  {activity.status === "approved" ? (
                    userRsvp?.status === "registered" ? (
                      <Button variant="outline" size="sm" onClick={handleCancelRegistration} disabled={rsvpActionLoading}>
                        {rsvpActionLoading ? "处理中..." : "取消报名"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleRegister}
                        disabled={
                          rsvpActionLoading ||
                          (activity.max_participants != null && rsvpCount >= activity.max_participants)
                        }
                      >
                        {rsvpActionLoading
                          ? "处理中..."
                          : userRsvp?.status === "cancelled"
                            ? "重新报名"
                            : "报名参加"}
                      </Button>
                    )
                  ) : activity.status === "pending_approval" ? (
                    <p className="text-xs text-muted-foreground">活动审批通过后即可报名</p>
                  ) : null}
                </div>

                {/* Registered users list */}
                {rsvpUsers.filter((u) => u.status === "registered").length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                      已报名人员
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {rsvpUsers
                        .filter((u) => u.status === "registered")
                        .map((u) => (
                          <Badge key={u.id} variant="secondary">
                            {u.full_name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Check-in Section */}
          {activity && activity.status === "approved" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="size-5" />
                  活动签到
                </CardTitle>
                <CardDescription>
                  已签到 {checkinCount} 人
                  {activity.max_participants != null &&
                    ` / 已报名 ${Math.min(rsvpCount, activity.max_participants)} 人`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {myCheckin ? (
                      <span className="font-medium text-green-600">✓ 已签到</span>
                    ) : (
                      <span className="text-muted-foreground">尚未签到</span>
                    )}
                  </div>

                  {user && (
                    myCheckin ? (
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                        已签到
                      </Badge>
                    ) : (
                      <Button size="sm" onClick={handleCheckin} disabled={checkinActionLoading}>
                        {checkinActionLoading ? "签到中..." : "签到"}
                      </Button>
                    )
                  )}
                </div>

                {/* Checked-in users list */}
                {checkinUsers.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                      已签到人员
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {checkinUsers.map((u) => (
                        <Badge key={u.id} variant="secondary">
                          {u.full_name || u.id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity Summary Section (already submitted) */}
          {hasSummary && (
            <Card>
              <CardHeader>
                <CardTitle>活动总结</CardTitle>
                <CardDescription>已提交的活动总结报告</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-sm whitespace-pre-wrap">{activityReport!.summary}</p>
                </div>
                {activityReport!.participant_count != null && activityReport!.participant_count > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">参与人数：</span>
                    <span>{activityReport!.participant_count} 人</span>
                  </div>
                )}

                {/* Photos display */}
                {activityReport!.photos && activityReport.photos.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">活动照片</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {activityReport.photos.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="relative aspect-square rounded-lg border overflow-hidden group cursor-pointer"
                          onClick={() => { setLightboxSrc(url); setLightboxOpen(true) }}
                        >
                          <img
                            src={url}
                            alt={`活动照片 ${idx + 1}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attachments display */}
                {activityReport!.attachments && activityReport.attachments.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">活动文档</h4>
                    <div className="space-y-2">
                      {activityReport.attachments.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <FileText className="size-4 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{getFileNameFromUrl(url)}</span>
                          <Download className="size-4 text-muted-foreground shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Activity Summary Input / Report Section */}
          {showSummarySection && !hasSummary && (
            <Card>
              <CardHeader>
                <CardTitle>上传活动总结</CardTitle>
                <CardDescription>
                  活动已完成，请提交活动总结报告
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="summary">总结内容</Label>
                  <Textarea
                    id="summary"
                    placeholder="请描述活动的完成情况、参与人数、效果等..."
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={5}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="participant_count">参与人数</Label>
                  <Input
                    id="participant_count"
                    type="number"
                    placeholder="0"
                    value={participantCount}
                    onChange={(e) => setParticipantCount(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Photo upload */}
                <div className="space-y-2">
                  <Label>活动照片 <span className="text-xs text-muted-foreground">（最多{MAX_PHOTOS}张）</span></Label>
                  {photoPreviews.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
                      {photoPreviews.map((preview, idx) => (
                        <div key={idx} className="relative aspect-square rounded-lg border overflow-hidden group">
                          <img
                            src={preview}
                            alt={`预览 ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removePhoto(idx)}
                            disabled={submitting}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photoFiles.length < MAX_PHOTOS && (
                    <>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handlePhotoSelect}
                        disabled={submitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={submitting}
                      >
                        <ImagePlus className="mr-1.5 size-4" />
                        添加照片
                      </Button>
                    </>
                  )}
                </div>

                {/* Document upload */}
                <div className="space-y-2">
                  <Label>活动文档 <span className="text-xs text-muted-foreground">（最多{MAX_DOCS}个，支持 PDF/DOC/DOCX）</span></Label>
                  {docFiles.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {docFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                          <FileText className="size-4 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{file.name}</span>
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeDoc(idx)}
                            disabled={submitting}
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {docFiles.length < MAX_DOCS && (
                    <>
                      <input
                        ref={docInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        multiple
                        className="hidden"
                        onChange={handleDocSelect}
                        disabled={submitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => docInputRef.current?.click()}
                        disabled={submitting}
                      >
                        <Upload className="mr-1.5 size-4" />
                        添加文档
                      </Button>
                    </>
                  )}
                </div>

                <Button
                  onClick={handleSubmitSummary}
                  disabled={submitting || !summary.trim()}
                >
                  {submitting ? "提交中..." : "提交总结"}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">活动不存在</p>
          </CardContent>
        </Card>
      )}

      {/* Lightbox for photo enlargement */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
          <button
            type="button"
            className="absolute top-2 right-2 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="size-5" />
          </button>
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt="照片放大"
              className="max-h-[80vh] w-full object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}