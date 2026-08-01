import { describe, expect, it } from "vitest"
import { resolveSafeRedirectPath } from "./navigation"

describe("resolveSafeRedirectPath", () => {
  it("preserves an internal check-in path and query token", () => {
    expect(
      resolveSafeRedirectPath("/dashboard/activities/a1/checkin?token=a%2Bb")
    ).toBe("/dashboard/activities/a1/checkin?token=a%2Bb")
  })

  it.each([
    null,
    "",
    "dashboard",
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "/dashboard\n/activities",
  ])("rejects unsafe destination %s", (candidate) => {
    expect(resolveSafeRedirectPath(candidate)).toBe("/dashboard")
  })

  it("supports a caller-provided fallback", () => {
    expect(resolveSafeRedirectPath("https://evil.example", "/login")).toBe("/login")
  })
})
