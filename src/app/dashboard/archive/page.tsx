"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ArrowUpDown, Calendar, Users, Search, Building2, Image as ImageIcon } from "lucide-react"

interface ActivityArchiveItem {
  id: string
  title: string
  status: string
  department_id: string | null
  end_time: string | null
  created_at: string
  reports: {
    summary: string | null
    photos: string[] | null
    participant_count: number | null
    submitted_by: string
    created_at: string
  } | null
}

interface Department {
  id: string
  name: string
}

type SortOption = "newest" | "oldest" | "participants_desc" | "participants_asc"

export default function ArchivePage() {
  const router = useRouter()
  const [items, setItems] = useState<ActivityArchiveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState<Department[]>([])
  const [filterDept, setFilterDept] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [search, setSearch] = useState("")
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const supabase = supabaseRef.current

    async function load() {
      try {
        // Fetch completed activities with their latest report
        const { data: activitiesData, error } = await supabase
          .from("activities")
          .select(`
            id, title, status, department_id, end_time, created_at,
            activity_reports (
              summary, photos, participant_count, submitted_by, created_at
            )
          `)
          .eq("status", "completed")
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Failed to load archive:", error.message)
          return
        }

        const mapped: ActivityArchiveItem[] = ((activitiesData || []) as unknown as any[]).map(
          (a: any) => ({
            id: a.id,
            title: a.title,
            status: a.status,
            department_id: a.department_id,
            end_time: a.end_time,
            created_at: a.created_at,
            reports:
              a.activity_reports && a.activity_reports.length > 0
                ? a.activity_reports[a.activity_reports.length - 1]
                : null,
          })
        )

        setItems(mapped)

        // Fetch departments
        const { data: deptData } = await supabase
          .from("departments")
          .select("id, name")
          .order("name", { ascending: true })

        if (deptData) {
          setDepartments(deptData as Department[])
        }
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const getDepartmentName = useCallback(
    (deptId: string | null) => {
      if (!deptId) return "未分配"
      const dept = departments.find((d) => d.id === deptId)
      return dept ? dept.name : "未分配"
    },
    [departments]
  )

  const getSummaryExcerpt = (summary: string | null, maxLen = 100) => {
    if (!summary) return "暂无总结"
    return summary.length > maxLen ? summary.substring(0, maxLen) + "..." : summary
  }

  const getPhotoPreviews = (photos: string[] | null, max = 3) => {
    if (!photos || photos.length === 0) return []
    return photos.slice(0, max)
  }

  // Apply filtering & sorting
  const filtered = items
    .filter((item) => {
      if (filterDept !== "all" && item.department_id !== filterDept) return false
      if (search.trim()) {
        const keyword = search.trim().toLowerCase()
        const summary = item.reports?.summary || ""
        return item.title.toLowerCase().includes(keyword) || summary.toLowerCase().includes(keyword)
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy as SortOption) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "participants_desc":
          return (b.reports?.participant_count || 0) - (a.reports?.participant_count || 0)
        case "participants_asc":
          return (a.reports?.participant_count || 0) - (b.reports?.participant_count || 0)
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">活动归档</h1>
        <p className="text-sm text-muted-foreground mt-1">查看所有已完成的活动记录和总结</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索活动标题或总结..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={filterDept} onValueChange={(v) => setFilterDept(v ?? "all")}>
          <SelectTrigger className="w-[160px]">
            <Building2 className="mr-1.5 size-4 text-muted-foreground" />
            <SelectValue placeholder="全部部门" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部部门</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? "newest")}>
          <SelectTrigger className="w-[160px]">
            <ArrowUpDown className="mr-1.5 size-4 text-muted-foreground" />
            <SelectValue placeholder="排序方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">最新优先</SelectItem>
            <SelectItem value="oldest">最早优先</SelectItem>
            <SelectItem value="participants_desc">参与人数↓</SelectItem>
            <SelectItem value="participants_asc">参与人数↑</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Archive cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {search || filterDept !== "all" ? "没有找到匹配的归档活动" : "暂无已完成的活动"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const previews = getPhotoPreviews(item.reports?.photos || [])
            return (
              <Card
                key={item.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/dashboard/activities/${item.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-1">{item.title}</CardTitle>
                    <Badge variant="outline" className="shrink-0">
                      已完成
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pb-2">
                  {/* Summary excerpt */}
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {getSummaryExcerpt(item.reports?.summary || null)}
                  </p>

                  {/* Photo previews */}
                  {previews.length > 0 && (
                    <div className="flex gap-1.5">
                      {previews.map((url, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square w-16 rounded-md border overflow-hidden shrink-0"
                        >
                          <img
                            src={url}
                            alt={`${item.title} 照片 ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {(item.reports?.photos?.length || 0) > 3 && (
                        <div className="flex items-center justify-center w-16 aspect-square rounded-md border bg-muted shrink-0">
                          <ImageIcon className="size-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {item.end_time
                      ? new Date(item.end_time).toLocaleDateString("zh-CN")
                      : "未知"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3" />
                    {getDepartmentName(item.department_id)}
                  </span>
                  {item.reports?.participant_count != null && item.reports.participant_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {item.reports.participant_count} 人
                    </span>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}