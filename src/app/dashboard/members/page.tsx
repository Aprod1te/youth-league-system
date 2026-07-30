"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Profile {
  id: string
  full_name: string | null
  student_id: string | null
  role: string | null
  created_at: string
  department: { id: string; name: string } | null
}

const roleOptions = [
  { value: "all", label: "全部" },
  { value: "admin", label: "管理员" },
  { value: "minister", label: "部长" },
  { value: "secretary", label: "团委书记" },
  { value: "officer", label: "干事" },
  { value: "member", label: "成员" },
  { value: "applicant", label: "申请人" },
]

const roleBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "default",
  minister: "secondary",
  secretary: "default",
  officer: "outline",
  member: "secondary",
  applicant: "destructive",
}

const roleLabel: Record<string, string> = {
  admin: "管理员",
  minister: "部长",
  secretary: "团委书记",
  officer: "干事",
  member: "成员",
  applicant: "申请人",
}

export default function MembersPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([])
  const [filterRole, setFilterRole] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    try {
      // Route guard: applicant cannot access this page
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (currentUser) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUser.id)
          .single()
        if (profileData && (profileData as { role: string }).role === "applicant") {
          router.push("/dashboard")
          return
        }
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, student_id, role, created_at, department:departments(id, name)")
        .order("created_at", { ascending: false })

      if (error) {
        setError(error.message)
        return
      }

      const profilesData = (data || []) as unknown as Profile[]
      setProfiles(profilesData)
      setFilteredProfiles(profilesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (filterRole === "all") {
      setFilteredProfiles(profiles)
    } else {
      setFilteredProfiles(profiles.filter((p) => p.role === filterRole))
    }
  }, [filterRole, profiles])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">人员管理</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">角色筛选：</span>
          <Select value={filterRole} onValueChange={(value) => setFilterRole(value ?? "all")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
      ) : filteredProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {filterRole !== "all" ? "没有匹配该角色的人员" : "暂无人员数据"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>头像</TableHead>
                <TableHead>学号</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>注册时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">
                    {profile.full_name || "-"}
                  </TableCell>
                  <TableCell>
                    <Avatar size="sm">
                      <AvatarFallback>
                        {(profile.full_name || "-").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>{profile.student_id || "-"}</TableCell>
                  <TableCell>
                    {profile.department?.name || "未分配"}
                  </TableCell>
                  <TableCell>
                    {profile.role ? (
                      <Badge variant={roleBadgeVariant[profile.role] || "outline"}>
                        {roleLabel[profile.role] || profile.role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(profile.created_at).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}