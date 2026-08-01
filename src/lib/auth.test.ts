import { describe, expect, it } from "vitest"
import { buildAuthCallbackUrl, resolveAuthFeedback } from "./auth"

describe("buildAuthCallbackUrl", () => {
  it("builds a callback URL with an encoded internal destination", () => {
    expect(
      buildAuthCallbackUrl(
        "https://league.example",
        "/reset-password?source=email"
      )
    ).toBe(
      "https://league.example/auth/callback?next=%2Freset-password%3Fsource%3Demail"
    )
  })

  it("replaces an unsafe destination with the dashboard", () => {
    expect(
      buildAuthCallbackUrl("https://league.example", "//evil.example")
    ).toBe("https://league.example/auth/callback?next=%2Fdashboard")
  })
})

describe("resolveAuthFeedback", () => {
  it("returns a fixed error message for an invalid auth link", () => {
    expect(resolveAuthFeedback("invalid_auth_link", null)).toEqual({
      kind: "error",
      message: "验证链接无效或已过期，请重新发起操作。",
    })
  })

  it("returns a fixed notice after a password update", () => {
    expect(resolveAuthFeedback(null, "password_updated")).toEqual({
      kind: "success",
      message: "密码已更新，请使用新密码登录。",
    })
  })

  it("returns a fixed notice for invite-only registration", () => {
    expect(resolveAuthFeedback(null, "invite_only")).toEqual({
      kind: "success",
      message: "系统仅限受邀用户使用，请联系管理员获取邀请。",
    })
  })

  it("ignores unknown query values", () => {
    expect(resolveAuthFeedback("arbitrary", "also-arbitrary")).toBeNull()
  })
})
