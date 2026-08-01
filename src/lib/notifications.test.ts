import { describe, expect, it } from "vitest"
import { getNotificationHref } from "./notifications"

describe("getNotificationHref", () => {
  it.each([
    ["application_review", "application-id", "/dashboard/applications"],
    ["application", "application-id", "/dashboard/departments"],
    ["activity_approval", "activity-id", "/dashboard/activities/approval"],
    ["task_approval", "task-id", "/dashboard/tasks/approval"],
    ["task_assigned", "task-id", "/dashboard/tasks/task-id"],
    ["department", "department-id", "/dashboard/departments/department-id"],
  ])("maps %s notifications to their workflow", (type, relatedId, expected) => {
    expect(getNotificationHref(type, relatedId)).toBe(expected)
  })

  it("falls back to the collection when a detail id is missing", () => {
    expect(getNotificationHref("activity", null)).toBe("/dashboard/activities")
    expect(getNotificationHref("task", null)).toBe("/dashboard/tasks")
  })

  it("encodes ids before placing them in a route", () => {
    expect(getNotificationHref("activity", "id/with spaces")).toBe(
      "/dashboard/activities/id%2Fwith%20spaces"
    )
  })

  it("does not navigate for an unknown notification type", () => {
    expect(getNotificationHref("unknown", "id")).toBeNull()
  })
})
