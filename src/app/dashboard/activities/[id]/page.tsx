"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import {
  getStorageDisplayName,
  getStringArray,
  isExternalFileUrl,
  sanitizeStorageFileName,
} from "@/lib/files"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Users, Upload, X, Download, ImagePlus, FileText, CheckSquare, QrCode, StopCircle } from "lucide-react"
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
  checkin_opens_at: string | null
  checkin_closes_at: string | null
  created_at: string | null
}

interface ActivityReport {
  id: string
  activity_id: string
  summary: string | null
  photos: string[] | null
  attachments: string[] | null
  participant_count: number | null
  submitted_by: string
  created_at: string | null
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
const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const MAX_DOC_BYTES = 15 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const ACCEPTED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

interface SignedFile {
  path: string
  url: string
}

async function createSignedFiles(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[]
): Promise<SignedFile[]> {
  const files = await Promise.all(
    paths.map(async (path) => {
      if (isExternalFileUrl(path)) return { path, url: path }
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
      return error || !data?.signedUrl ? null : { path, url: data.signedUrl }
    })
  )
  return files.filter((file): file is SignedFile => file !== null)
}

export default function ActivityDetailPage() {
  const params = useParams()
  const router = useRouter()
  const activityId = params.id as string

  const [activity, setActivity] = useState<ActivityDetail | null>(null)
  const [activityReport, setActivityReport] = useState<ActivityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userDepartmentId, setUserDepartmentId] = useState<string | null>(null)
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
  const [signedPhotos, setSignedPhotos] = useState<SignedFile[]>([])
  const [signedDocuments, setSignedDocuments] = useState<SignedFile[]>([])

  // Check-in state
  const [myCheckin, setMyCheckin] = useState<{ id: string } | null>(null)
  const [checkinCount, setCheckinCount] = useState(0)
  const [checkinUsers, setCheckinUsers] = useState<Array<{ id: string; full_name: string | null }>>([])
  const [checkinActionLoading, setCheckinActionLoading] = useState(false)
  const [checkinDuration, setCheckinDuration] = useState(30)
  const [checkinToken, setCheckinToken] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [showQrDialog, setShowQrDialog] = useState(false)

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
        let currentUserRole = "applicant"

        if (currentUser) {
          const { data: currentProfile } = await supabase
            .from("profiles")
            .select("role, department_id")
            .eq("id", currentUser.id)
            .maybeSingle()
          currentUserRole = currentProfile?.role ?? "applicant"
          setUserRole(currentUserRole)
          setUserDepartmentId(currentProfile?.department_id ?? null)
        }

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
          const rawReport = reportData[0]
          const report: ActivityReport = {
            ...rawReport,
            photos: getStringArray(rawReport.photos),
            attachments: getStringArray(rawReport.attachments),
          }
          setActivityReport(report)
          const [photos, documents] = await Promise.all([
            createSignedFiles(supabase, "activity-photos", report.photos || []),
            createSignedFiles(supabase, "activity-documents", report.attachments || []),
          ])
          setSignedPhotos(photos)
          setSignedDocuments(documents)
        }

        const canViewParticipantLists = currentUserRole !== "applicant"
        let rsvpQuery = supabase
          .from("activity_rsvps")
          .select("id, user_id, status")
          .eq("activity_id", activityId)
        let checkinQuery = supabase
          .from("activity_checkins")
          .select("id, user_id")
          .eq("activity_id", activityId)

        if (!canViewParticipantLists) {
          rsvpQuery = rsvpQuery.eq("user_id", currentUser?.id || "")
          checkinQuery = checkinQuery.eq("user_id", currentUser?.id || "")
        }

        const [profileResult, rsvpResult, checkinResult, countResult] = await Promise.all([
            canViewParticipantLists
              ? supabase.from("profiles").select("id, full_name")
              : Promise.resolve({ data: [] as ProfileOption[], error: null }),
            rsvpQuery,
            checkinQuery,
            supabase.rpc("get_activity_participation_counts", {
              p_activity_id: activityId,
            }),
          ])

        const participationError =
          profileResult.error ||
          rsvpResult.error ||
          checkinResult.error ||
          countResult.error
        if (participationError) throw participationError

        const profileData = profileResult.data
        const rsvpData = rsvpResult.data
        const checkinData = checkinResult.data
        const countData = countResult.data

        const profilesList = (profileData || []) as ProfileOption[]
        const map: Record<string, string> = {}
        for (const p of profilesList) {
          map[p.id] = p.full_name || "未命名成员"
        }
        setUserNameMap(map)

        const rsvpList = (rsvpData || []) as Array<{ id: string; user_id: string; status: string }>
        const participationCounts = countData?.[0]
        setRsvpCount(
          participationCounts?.registered_count ??
            rsvpList.filter((r) => r.status === "registered").length
        )
        setRsvpUsers(
          rsvpList.map((r) => ({
            id: r.user_id,
            full_name: map[r.user_id] || "未公开",
            status: r.status,
          }))
        )

        if (currentUser) {
          const myRsvp = rsvpList.find((r) => r.user_id === currentUser.id)
          setUserRsvp(myRsvp ? { id: myRsvp.id, status: myRsvp.status } : null)
        }

        const checkinList = (checkinData || []) as Array<{ id: string; user_id: string }>
        setCheckinCount(participationCounts?.checkin_count ?? checkinList.length)
        setCheckinUsers(
          checkinList.map((c) => ({
            id: c.user_id,
            full_name: map[c.user_id] || "未公开",
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

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

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
      if (ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_PHOTO_BYTES) {
        validFiles.push(file)
      } else {
        invalidNames.push(file.name)
      }
    }

    if (invalidNames.length > 0) {
      toast.add({
        type: "error",
        title: "不支持的文件类型",
        description: `${invalidNames.join(", ")} 的格式不受支持或超过 8 MB`,
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
      if (ACCEPTED_DOC_TYPES.includes(file.type) && file.size <= MAX_DOC_BYTES) {
        validFiles.push(file)
      } else {
        invalidNames.push(file.name)
      }
    }

    if (invalidNames.length > 0) {
      toast.add({
        type: "error",
        title: "不支持的文件类型",
        description: `${invalidNames.join(", ")} 的格式不受支持或超过 15 MB`,
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
    const paths: string[] = []

    for (const file of files) {
      const safeName = sanitizeStorageFileName(file.name)
      const filePath = `${prefix}/${crypto.randomUUID()}-${safeName}`

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

      paths.push(filePath)
    }

    return paths
  }

  const handleSubmitSummary = async () => {
    if (!user || !activity || !summary.trim()) return

    setSubmitting(true)
    const supabase = supabaseRef.current

    // Upload photos
    let photoPaths: string[] = []
    if (photoFiles.length > 0) {
      photoPaths = await uploadFiles(photoFiles, "activity-photos", activityId)
    }

    // Upload documents
    let documentPaths: string[] = []
    if (docFiles.length > 0) {
      documentPaths = await uploadFiles(docFiles, "activity-documents", activityId)
    }

    const { data: reportId, error: submitError } = await supabase.rpc("submit_activity_report", {
      p_activity_id: activity.id,
      p_summary: summary.trim(),
      p_participant_count: parseInt(participantCount) || 0,
      p_photos: photoPaths,
      p_attachments: documentPaths,
    })

    if (submitError) {
      await Promise.all([
        photoPaths.length
          ? supabase.storage.from("activity-photos").remove(photoPaths)
          : Promise.resolve(),
        documentPaths.length
          ? supabase.storage.from("activity-documents").remove(documentPaths)
          : Promise.resolve(),
      ])
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

    const [photos, documents] = await Promise.all([
      createSignedFiles(supabase, "activity-photos", photoPaths),
      createSignedFiles(supabase, "activity-documents", documentPaths),
    ])
    setActivityReport({
      id: reportId,
      activity_id: activity.id,
      summary: summary.trim(),
      participant_count: parseInt(participantCount) || 0,
      submitted_by: user.id,
      photos: photoPaths,
      attachments: documentPaths,
      created_at: new Date().toISOString(),
    })
    setSignedPhotos(photos)
    setSignedDocuments(documents)

    setSummary("")
    setParticipantCount("")
    setPhotoFiles([])
    setPhotoPreviews([])
    setDocFiles([])
    setSubmitting(false)

  }

  const getOrganizerName = (userId: string) => {
    return userNameMap[userId] || "未公开"
  }

  const handleRegister = async () => {
    if (!user || !activity) return
    setRsvpActionLoading(true)
    const supabase = supabaseRef.current

    const { data: rsvpId, error } = await supabase.rpc("register_activity", {
      p_activity_id: activity.id,
    })

    if (error || !rsvpId) {
      toast.add({ type: "error", title: "报名失败", description: error?.message || "未能创建报名记录" })
      setRsvpActionLoading(false)
      return
    }

    const wasRegistered = userRsvp?.status === "registered"
    toast.add({ type: "success", title: "报名成功" })
    setUserRsvp({ id: rsvpId, status: "registered" })
    if (!wasRegistered) setRsvpCount((prev) => prev + 1)
    setRsvpUsers((prev) => {
      const existing = prev.find((item) => item.id === user.id)
      if (existing) {
        return prev.map((item) =>
          item.id === user.id ? { ...item, status: "registered" } : item
        )
      }
      return [
        ...prev,
        {
          id: user.id,
          full_name: userNameMap[user.id] || "当前用户",
          status: "registered",
        },
      ]
    })
    setRsvpActionLoading(false)
  }

  const handleCancelRegistration = async () => {
    if (!userRsvp) return
    setRsvpActionLoading(true)
    const supabase = supabaseRef.current

    const { error } = await supabase.rpc("cancel_activity_registration", {
      p_activity_id: activityId,
    })

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

  const handleOpenCheckin = async () => {
    if (!activity) return
    setCheckinActionLoading(true)
    const supabase = supabaseRef.current

    const { data: token, error } = await supabase.rpc("open_activity_checkin", {
      p_activity_id: activity.id,
      p_duration_minutes: checkinDuration,
    })

    if (error || !token) {
      toast.add({ type: "error", title: "开启签到失败", description: error?.message || "未能生成签到令牌" })
      setCheckinActionLoading(false)
      return
    }

    const now = new Date()
    setCurrentTime(now.getTime())
    setCheckinToken(token)
    setActivity((current) => current ? {
      ...current,
      checkin_opens_at: now.toISOString(),
      checkin_closes_at: new Date(now.getTime() + checkinDuration * 60_000).toISOString(),
    } : current)
    setShowQrDialog(true)
    toast.add({ type: "success", title: "签到已开启" })
    setCheckinActionLoading(false)
  }

  const handleCloseCheckin = async () => {
    if (!activity) return
    setCheckinActionLoading(true)
    const { error } = await supabaseRef.current.rpc("close_activity_checkin", {
      p_activity_id: activity.id,
    })
    if (error) {
      toast.add({ type: "error", title: "关闭签到失败", description: error.message })
    } else {
      setCheckinToken(null)
      setCurrentTime(Date.now())
      setShowQrDialog(false)
      setActivity((current) => current ? { ...current, checkin_closes_at: new Date().toISOString() } : current)
      toast.add({ type: "success", title: "签到已关闭" })
    }
    setCheckinActionLoading(false)
  }

  const canManageActivity = Boolean(
    activity && user && (
      activity.organizer_id === user.id ||
      userRole === "admin" ||
      userRole === "secretary" ||
      (userRole === "minister" && activity.department_id === userDepartmentId)
    )
  )
  const isCheckinOpen = Boolean(
    activity?.checkin_opens_at &&
    activity?.checkin_closes_at &&
    currentTime >= new Date(activity.checkin_opens_at).getTime() &&
    currentTime <= new Date(activity.checkin_closes_at).getTime()
  )
  const checkinUrl =
    typeof window !== "undefined" && activity && checkinToken
      ? `${window.location.origin}/dashboard/activities/${activity.id}/checkin?token=${encodeURIComponent(checkinToken)}`
      : null

  const showSummarySection = activity && activity.status === "completed" && canManageActivity
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
                    创建时间：{activity.created_at ? new Date(activity.created_at).toLocaleDateString("zh-CN") : "-"}
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
                {userRole !== "applicant" &&
                  rsvpUsers.filter((u) => u.status === "registered").length > 0 && (
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
          {activity && ["approved", "in_progress"].includes(activity.status) && (
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

                  <Badge variant="outline">
                    {isCheckinOpen ? "签到开放中" : "签到未开放"}
                  </Badge>
                </div>

                {/* Checked-in users list */}
                {userRole !== "applicant" && checkinUsers.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                      已签到人员
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {checkinUsers.map((u) => (
                        <Badge key={u.id} variant="secondary">
                            {u.full_name || "未命名成员"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {canManageActivity && (
                  <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="checkin-duration">开放时长（分钟）</Label>
                      <Input
                        id="checkin-duration"
                        type="number"
                        min={5}
                        max={240}
                        value={checkinDuration}
                        onChange={(event) => setCheckinDuration(Number(event.target.value))}
                        className="w-32"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleOpenCheckin}
                      disabled={
                        checkinActionLoading ||
                        !Number.isInteger(checkinDuration) ||
                        checkinDuration < 5 ||
                        checkinDuration > 240
                      }
                    >
                      <QrCode className="mr-1.5 size-4" />
                      {isCheckinOpen ? "重新生成二维码" : "开启签到"}
                    </Button>
                    {checkinToken && isCheckinOpen && (
                      <Button variant="outline" size="sm" onClick={() => setShowQrDialog(true)}>
                        展示二维码
                      </Button>
                    )}
                    {isCheckinOpen && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCloseCheckin}
                        disabled={checkinActionLoading}
                      >
                        <StopCircle className="mr-1.5 size-4" />
                        关闭签到
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* QR Code Dialog */}
          <Dialog open={showQrDialog && Boolean(checkinUrl)} onOpenChange={setShowQrDialog}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>扫码签到</DialogTitle>
                <DialogDescription>
                  有效期至 {activity.checkin_closes_at ? new Date(activity.checkin_closes_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "-"}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6">
                {checkinUrl && (
                  <div className="rounded-md border bg-white p-4">
                    <QRCodeSVG
                      value={checkinUrl}
                      size={240}
                    />
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

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
                {signedPhotos.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">活动照片</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {signedPhotos.map((file, idx) => (
                        <button
                          key={file.path}
                          type="button"
                          className="relative aspect-square rounded-lg border overflow-hidden group cursor-pointer"
                          onClick={() => { setLightboxSrc(file.url); setLightboxOpen(true) }}
                        >
                          <Image
                            src={file.url}
                            alt={`活动照片 ${idx + 1}`}
                            fill
                            sizes="(max-width: 640px) 50vw, 25vw"
                            unoptimized
                            className="object-cover transition-transform group-hover:scale-105"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attachments display */}
                {signedDocuments.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">活动文档</h4>
                    <div className="space-y-2">
                      {signedDocuments.map((file) => (
                        <a
                          key={file.path}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <FileText className="size-4 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{getStorageDisplayName(file.path)}</span>
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
                          <Image
                            src={preview}
                            alt={`预览 ${idx + 1}`}
                            fill
                            sizes="(max-width: 640px) 50vw, 33vw"
                            unoptimized
                            className="object-cover"
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
            <Image
              src={lightboxSrc}
              alt="照片放大"
              width={1600}
              height={1200}
              unoptimized
              className="max-h-[80vh] w-full object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
