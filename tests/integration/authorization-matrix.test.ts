import { randomUUID } from "node:crypto"
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Database } from "../../src/lib/database.types"
import { readLocalSupabaseConfig } from "./local-supabase"

const ROLES = ["admin", "secretary", "minister", "member", "applicant"] as const
const ORGANIZATION_ROLES = ROLES.filter((role) => role !== "applicant")

type Role = (typeof ROLES)[number]
type ErrorLike = { code?: string; message: string }
type Actor = {
  client: SupabaseClient<Database>
  email: string
  id: string
  role: Role
}

const local = readLocalSupabaseConfig()
const runTag = randomUUID().replaceAll("-", "").slice(0, 12)
const marker = `[integration:${runTag}]`
const password = `Local-only-${runTag}-A9!`
const createdUserIds = new Set<string>()
const photoPaths = new Set<string>()
const draftActivityIds = new Map<Role, string>()

let service: SupabaseClient<Database>
let anonymous: SupabaseClient<Database>
const actors = {} as Record<Role, Actor>
let departmentId = ""
let primaryActivityId = ""
let primaryPhotoPath = ""

function clientFor(key: string, storageKey: string) {
  return createClient<Database>(local.apiUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey,
    },
  })
}

function expectDenied(error: ErrorLike | null) {
  expect(error, "expected the request to be denied").not.toBeNull()
}

function requireSuccess<T>(
  label: string,
  result: { data: T; error: ErrorLike | null }
): NonNullable<T> {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`)
  }
  if (result.data === null) {
    throw new Error(`${label}: request returned no data`)
  }
  return result.data as NonNullable<T>
}

function requireNoError(
  label: string,
  result: { error: ErrorLike | null }
) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`)
  }
}

async function removeStorageFiles() {
  if (photoPaths.size === 0) return

  const result = await service.storage
    .from("activity-photos")
    .remove([...photoPaths])
  requireNoError("remove integration storage files", result)
}

async function deleteTaggedRows() {
  const taskResult = await service
    .from("tasks")
    .delete()
    .like("title", `${marker}%`)
  requireNoError("remove integration tasks", taskResult)

  const activityResult = await service
    .from("activities")
    .delete()
    .like("title", `${marker}%`)
  requireNoError("remove integration activities", activityResult)
}

beforeAll(async () => {
  service = clientFor(local.serviceRoleKey, `integration-service-${runTag}`)
  anonymous = clientFor(local.anonKey, `integration-anon-${runTag}`)

  const department = requireSuccess(
    "create fixture department",
    await service
      .from("departments")
      .insert({
        name: `${marker} Core Department`,
        description: "Local authorization test fixture",
        max_members: 20,
      })
      .select("id")
      .single()
  )
  departmentId = department.id

  for (const [index, role] of ROLES.entries()) {
    const email = `codex.${role}.${runTag}@example.com`
    const created = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        full_name: `Integration ${role}`,
        student_id: `IT${runTag.slice(0, 8)}${index}`,
      },
    })
    if (created.error || !created.data.user) {
      throw new Error(
        `create ${role} user: ${created.error?.message ?? "no user returned"}`
      )
    }
    createdUserIds.add(created.data.user.id)

    const profileResult = await service
      .from("profiles")
      .update({
        department_id: role === "applicant" ? null : departmentId,
        role,
      })
      .eq("id", created.data.user.id)
    requireNoError(`assign ${role} profile`, profileResult)

    const client = clientFor(local.anonKey, `integration-${role}-${runTag}`)
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(
        `sign in ${role}: ${signedIn.error?.message ?? "no session returned"}`
      )
    }

    actors[role] = {
      client,
      email,
      id: created.data.user.id,
      role,
    }
  }

  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000)
  primaryActivityId = requireSuccess(
    "member creates primary activity",
    await actors.member.client.rpc("create_activity", {
      p_title: `${marker} Primary Activity`,
      p_description: "Five-role authorization workflow",
      p_location: "Integration room",
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString(),
      p_budget: 0,
      p_max_participants: 10,
    })
  )
  requireNoError(
    "member submits primary activity",
    await actors.member.client.rpc("submit_activity_for_approval", {
      p_activity_id: primaryActivityId,
    })
  )
  requireNoError(
    "secretary approves primary activity",
    await actors.secretary.client.rpc("review_activity", {
      p_activity_id: primaryActivityId,
      p_decision: "approved",
      p_note: "Integration approval",
    })
  )
}, 120_000)

afterAll(async () => {
  if (!service) return

  await removeStorageFiles()
  await deleteTaggedRows()

  for (const userId of createdUserIds) {
    const result = await service.auth.admin.deleteUser(userId)
    if (result.error) {
      throw new Error(`delete integration user ${userId}: ${result.error.message}`)
    }
  }

  const departmentResult = await service
    .from("departments")
    .delete()
    .like("name", `${marker}%`)
  requireNoError("remove integration departments", departmentResult)
}, 120_000)

describe.sequential("local Supabase five-role authorization matrix", () => {
  it("keeps anonymous users out and prevents applicant privilege escalation", async () => {
    const selfSignup = await anonymous.auth.signUp({
      email: `forbidden.signup.${runTag}@example.com`,
      password,
    })
    if (selfSignup.data.user) createdUserIds.add(selfSignup.data.user.id)
    expectDenied(selfSignup.error)

    const anonymousActivities = await anonymous
      .from("activities")
      .select("id")
      .eq("id", primaryActivityId)
    expectDenied(anonymousActivities.error)

    const anonymousCounts = await anonymous.rpc(
      "get_activity_participation_counts",
      { p_activity_id: primaryActivityId }
    )
    expectDenied(anonymousCounts.error)

    const applicantProfiles = requireSuccess(
      "applicant reads visible profiles",
      await actors.applicant.client
        .from("profiles")
        .select("id, full_name, role")
    )
    expect(applicantProfiles).toHaveLength(1)
    expect(applicantProfiles[0]).toMatchObject({
      id: actors.applicant.id,
      role: "applicant",
    })

    const memberProfiles = requireSuccess(
      "member reads organization profiles",
      await actors.member.client
        .from("profiles")
        .select("id, full_name, role")
    )
    const memberProfileIds = new Set(memberProfiles.map((profile) => profile.id))
    for (const role of ROLES) {
      expect(memberProfileIds.has(actors[role].id), `${role} profile is visible`).toBe(
        true
      )
    }

    const privatePhone = await actors.member.client
      .from("profiles")
      .select("phone")
    expectDenied(privatePhone.error)

    const escalation = await actors.applicant.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", actors.applicant.id)
    expectDenied(escalation.error)

    const applicantProfile = requireSuccess(
      "verify applicant role",
      await actors.applicant.client
        .from("profiles")
        .select("role")
        .eq("id", actors.applicant.id)
        .single()
    )
    expect(applicantProfile.role).toBe("applicant")
  })

  it("allows organization roles to draft activities but blocks applicants and direct writes", async () => {
    for (const role of ORGANIZATION_ROLES) {
      const activityId = requireSuccess(
        `${role} creates activity draft`,
        await actors[role].client.rpc("create_activity", {
          p_title: `${marker} Draft by ${role}`,
          p_description: `Created by ${role}`,
          p_max_participants: 10,
        })
      )
      draftActivityIds.set(role, activityId)
    }

    const applicantCreate = await actors.applicant.client.rpc(
      "create_activity",
      { p_title: `${marker} Forbidden applicant draft` }
    )
    expectDenied(applicantCreate.error)

    const directInsert = await actors.member.client.from("activities").insert({
      title: `${marker} Forbidden direct insert`,
      organizer_id: actors.member.id,
      department_id: departmentId,
    })
    expectDenied(directInsert.error)

    const memberCreatesDepartment = await actors.member.client.rpc(
      "create_department",
      { p_name: `${marker} Forbidden member department` }
    )
    expectDenied(memberCreatesDepartment.error)

    const visibleToApplicant = requireSuccess(
      "applicant reads public activities",
      await actors.applicant.client
        .from("activities")
        .select("id, status")
        .like("title", `${marker}%`)
    )
    expect(visibleToApplicant).toEqual([
      expect.objectContaining({ id: primaryActivityId, status: "approved" }),
    ])
  })

  it("limits activity approval to administrators and secretaries", async () => {
    const adminDraftId = draftActivityIds.get("admin")!
    const ministerDraftId = draftActivityIds.get("minister")!

    const memberSubmitsAnotherDraft = await actors.member.client.rpc(
      "submit_activity_for_approval",
      { p_activity_id: adminDraftId }
    )
    expectDenied(memberSubmitsAnotherDraft.error)

    requireNoError(
      "minister submits own activity",
      await actors.minister.client.rpc("submit_activity_for_approval", {
        p_activity_id: ministerDraftId,
      })
    )

    const ministerReviews = await actors.minister.client.rpc(
      "review_activity",
      {
        p_activity_id: ministerDraftId,
        p_decision: "approved",
      }
    )
    expectDenied(ministerReviews.error)

    requireNoError(
      "admin approves minister activity",
      await actors.admin.client.rpc("review_activity", {
        p_activity_id: ministerDraftId,
        p_decision: "approved",
        p_note: "Approved by integration admin",
      })
    )

    const primary = requireSuccess(
      "read primary approval",
      await actors.applicant.client
        .from("activities")
        .select("id, approved_by, organizer_id, status")
        .eq("id", primaryActivityId)
        .single()
    )
    expect(primary).toMatchObject({
      approved_by: actors.secretary.id,
      organizer_id: actors.member.id,
      status: "approved",
    })

    const applicantActivityIds = requireSuccess(
      "applicant reads approved activities",
      await actors.applicant.client
        .from("activities")
        .select("id")
        .like("title", `${marker}%`)
    ).map((activity) => activity.id)
    expect(new Set(applicantActivityIds)).toEqual(
      new Set([primaryActivityId, ministerDraftId])
    )
  })

  it("enforces the task creation, approval, visibility, and submission workflow", async () => {
    const taskId = requireSuccess(
      "minister creates task",
      await actors.minister.client.rpc("create_task", {
        p_title: `${marker} Department Task`,
        p_description: "Integration task workflow",
        p_assigned_to: actors.member.id,
        p_priority: "high",
        p_department_id: departmentId,
      })
    )

    const hiddenBeforeApproval = requireSuccess(
      "member reads tasks before approval",
      await actors.member.client
        .from("tasks")
        .select("id")
        .eq("id", taskId)
    )
    expect(hiddenBeforeApproval).toEqual([])

    const applicantCreatesTask = await actors.applicant.client.rpc(
      "create_task",
      { p_title: `${marker} Forbidden applicant task` }
    )
    expectDenied(applicantCreatesTask.error)

    const memberCreatesTask = await actors.member.client.rpc("create_task", {
      p_title: `${marker} Forbidden member task`,
    })
    expectDenied(memberCreatesTask.error)

    const ministerReviewsTask = await actors.minister.client.rpc(
      "review_task",
      { p_task_id: taskId, p_decision: "approved" }
    )
    expectDenied(ministerReviewsTask.error)

    requireNoError(
      "secretary approves task",
      await actors.secretary.client.rpc("review_task", {
        p_task_id: taskId,
        p_decision: "approved",
        p_note: "Approved for integration",
      })
    )

    const visibleAfterApproval = requireSuccess(
      "member reads approved task",
      await actors.member.client
        .from("tasks")
        .select("id, approval_status, assigned_to")
        .eq("id", taskId)
        .single()
    )
    expect(visibleAfterApproval).toMatchObject({
      approval_status: "approved",
      assigned_to: actors.member.id,
    })

    const applicantSubmitsTask = await actors.applicant.client.rpc(
      "submit_task",
      {
        p_task_id: taskId,
        p_content: "Forbidden submission",
        p_progress: 100,
      }
    )
    expectDenied(applicantSubmitsTask.error)

    requireSuccess(
      "member submits task",
      await actors.member.client.rpc("submit_task", {
        p_task_id: taskId,
        p_content: "Completed during integration testing",
        p_progress: 100,
        p_attachments: [],
      })
    )

    const completedTask = requireSuccess(
      "read completed task",
      await actors.member.client
        .from("tasks")
        .select("status")
        .eq("id", taskId)
        .single()
    )
    expect(completedTask.status).toBe("completed")

    const applicantTasks = requireSuccess(
      "applicant reads tasks",
      await actors.applicant.client
        .from("tasks")
        .select("id")
        .like("title", `${marker}%`)
    )
    expect(applicantTasks).toEqual([])
  })

  it("lets every role register while hiding participant identities from applicants", async () => {
    const rsvpIds = new Map<Role, string>()
    for (const role of ROLES) {
      const rsvpId = requireSuccess(
        `${role} registers for activity`,
        await actors[role].client.rpc("register_activity", {
          p_activity_id: primaryActivityId,
        })
      )
      rsvpIds.set(role, rsvpId)
    }

    const counts = requireSuccess(
      "applicant reads participation counts",
      await actors.applicant.client.rpc(
        "get_activity_participation_counts",
        { p_activity_id: primaryActivityId }
      )
    )
    expect(counts).toEqual([
      expect.objectContaining({ registered_count: 5, checkin_count: 0 }),
    ])

    const applicantRows = requireSuccess(
      "applicant reads own RSVP",
      await actors.applicant.client
        .from("activity_rsvps")
        .select("id, user_id, status")
        .eq("activity_id", primaryActivityId)
    )
    expect(applicantRows).toEqual([
      {
        id: rsvpIds.get("applicant"),
        user_id: actors.applicant.id,
        status: "registered",
      },
    ])

    const otherParticipant = requireSuccess(
      "applicant attempts to read another RSVP",
      await actors.applicant.client
        .from("activity_rsvps")
        .select("id, user_id")
        .eq("activity_id", primaryActivityId)
        .eq("user_id", actors.member.id)
    )
    expect(otherParticipant).toEqual([])

    const memberRows = requireSuccess(
      "member reads participant list",
      await actors.member.client
        .from("activity_rsvps")
        .select("user_id")
        .eq("activity_id", primaryActivityId)
    )
    expect(new Set(memberRows.map((row) => row.user_id))).toEqual(
      new Set(ROLES.map((role) => actors[role].id))
    )

    const directRsvp = await actors.applicant.client
      .from("activity_rsvps")
      .insert({
        activity_id: primaryActivityId,
        user_id: actors.applicant.id,
      })
    expectDenied(directRsvp.error)

    requireNoError(
      "applicant cancels registration",
      await actors.applicant.client.rpc("cancel_activity_registration", {
        p_activity_id: primaryActivityId,
      })
    )
    requireSuccess(
      "applicant registers again",
      await actors.applicant.client.rpc("register_activity", {
        p_activity_id: primaryActivityId,
      })
    )
  })

  it("allows registered applicants to check in without exposing other check-ins", async () => {
    const applicantOpensCheckin = await actors.applicant.client.rpc(
      "open_activity_checkin",
      { p_activity_id: primaryActivityId, p_duration_minutes: 30 }
    )
    expectDenied(applicantOpensCheckin.error)

    const token = requireSuccess(
      "organizer opens check-in",
      await actors.member.client.rpc("open_activity_checkin", {
        p_activity_id: primaryActivityId,
        p_duration_minutes: 30,
      })
    )
    expect(token).toHaveLength(64)

    const wrongToken = await actors.applicant.client.rpc(
      "check_in_activity",
      { p_activity_id: primaryActivityId, p_token: "0".repeat(64) }
    )
    expectDenied(wrongToken.error)

    requireSuccess(
      "applicant checks in",
      await actors.applicant.client.rpc("check_in_activity", {
        p_activity_id: primaryActivityId,
        p_token: token,
      })
    )
    requireSuccess(
      "member checks in",
      await actors.member.client.rpc("check_in_activity", {
        p_activity_id: primaryActivityId,
        p_token: token,
      })
    )

    const applicantCheckins = requireSuccess(
      "applicant reads own check-in",
      await actors.applicant.client
        .from("activity_checkins")
        .select("user_id")
        .eq("activity_id", primaryActivityId)
    )
    expect(applicantCheckins).toEqual([{ user_id: actors.applicant.id }])

    const memberCheckins = requireSuccess(
      "member reads check-in list",
      await actors.member.client
        .from("activity_checkins")
        .select("user_id")
        .eq("activity_id", primaryActivityId)
    )
    expect(new Set(memberCheckins.map((row) => row.user_id))).toEqual(
      new Set([actors.applicant.id, actors.member.id])
    )

    const counts = requireSuccess(
      "applicant reads post-check-in counts",
      await actors.applicant.client.rpc(
        "get_activity_participation_counts",
        { p_activity_id: primaryActivityId }
      )
    )
    expect(counts).toEqual([
      expect.objectContaining({ registered_count: 5, checkin_count: 2 }),
    ])

    const cancelAfterCheckin = await actors.applicant.client.rpc(
      "cancel_activity_registration",
      { p_activity_id: primaryActivityId }
    )
    expectDenied(cancelAfterCheckin.error)

    const directCheckin = await actors.applicant.client
      .from("activity_checkins")
      .insert({
        activity_id: primaryActivityId,
        user_id: actors.applicant.id,
      })
    expectDenied(directCheckin.error)

    const applicantClosesCheckin = await actors.applicant.client.rpc(
      "close_activity_checkin",
      { p_activity_id: primaryActivityId }
    )
    expectDenied(applicantClosesCheckin.error)

    requireNoError(
      "organizer closes check-in",
      await actors.member.client.rpc("close_activity_checkin", {
        p_activity_id: primaryActivityId,
      })
    )

    const checkinAfterClose = await actors.admin.client.rpc(
      "check_in_activity",
      { p_activity_id: primaryActivityId, p_token: token }
    )
    expectDenied(checkinAfterClose.error)
  })

  it("keeps Storage private and activity-scoped", async () => {
    const bucket = requireSuccess(
      "read activity photo bucket",
      await service.storage.getBucket("activity-photos")
    )
    expect(bucket.public).toBe(false)

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    )
    primaryPhotoPath = `${primaryActivityId}/${runTag}-primary.png`
    const primaryUpload = await actors.member.client.storage
      .from("activity-photos")
      .upload(primaryPhotoPath, png, { contentType: "image/png" })
    requireNoError("organizer uploads approved activity photo", primaryUpload)
    photoPaths.add(primaryPhotoPath)

    const applicantUploadPath = `${primaryActivityId}/${runTag}-applicant.png`
    const applicantUpload = await actors.applicant.client.storage
      .from("activity-photos")
      .upload(applicantUploadPath, png, { contentType: "image/png" })
    if (!applicantUpload.error) photoPaths.add(applicantUploadPath)
    expectDenied(applicantUpload.error)

    const applicantDownload = requireSuccess(
      "applicant downloads visible activity photo",
      await actors.applicant.client.storage
        .from("activity-photos")
        .download(primaryPhotoPath)
    )
    expect(applicantDownload.size).toBeGreaterThan(0)

    const anonymousDownload = await anonymous.storage
      .from("activity-photos")
      .download(primaryPhotoPath)
    expectDenied(anonymousDownload.error)

    const memberDraftId = draftActivityIds.get("member")!
    const draftPhotoPath = `${memberDraftId}/${runTag}-draft.png`
    const draftUpload = await actors.member.client.storage
      .from("activity-photos")
      .upload(draftPhotoPath, png, { contentType: "image/png" })
    requireNoError("organizer uploads draft activity photo", draftUpload)
    photoPaths.add(draftPhotoPath)

    const hiddenDraftDownload = await actors.applicant.client.storage
      .from("activity-photos")
      .download(draftPhotoPath)
    expectDenied(hiddenDraftDownload.error)
  })

  it("shares completed activity reports with applicants but keeps report writes managed", async () => {
    const applicantReport = await actors.applicant.client.rpc(
      "submit_activity_report",
      {
        p_activity_id: primaryActivityId,
        p_summary: "Forbidden applicant report",
      }
    )
    expectDenied(applicantReport.error)

    requireNoError(
      "organizer completes activity",
      await actors.member.client.rpc("set_activity_lifecycle_status", {
        p_activity_id: primaryActivityId,
        p_status: "completed",
      })
    )

    requireSuccess(
      "organizer submits activity report",
      await actors.member.client.rpc("submit_activity_report", {
        p_activity_id: primaryActivityId,
        p_summary: "Integration activity completed successfully.",
        p_participant_count: 5,
        p_photos: [primaryPhotoPath],
        p_attachments: [],
      })
    )

    const report = requireSuccess(
      "applicant reads activity report",
      await actors.applicant.client
        .from("activity_reports")
        .select("activity_id, summary, participant_count, photos")
        .eq("activity_id", primaryActivityId)
        .single()
    )
    expect(report).toMatchObject({
      activity_id: primaryActivityId,
      participant_count: 5,
      photos: [primaryPhotoPath],
      summary: "Integration activity completed successfully.",
    })
  })
})
