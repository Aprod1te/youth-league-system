import { resolveSafeRedirectPath } from "./navigation"

export const MIN_PASSWORD_LENGTH = 10

export type AuthFeedback = {
  kind: "error" | "success"
  message: string
}

const AUTH_ERRORS: Record<string, string> = {
  invalid_auth_link: "验证链接无效或已过期，请重新发起操作。",
}

const AUTH_NOTICES: Record<string, string> = {
  invite_accepted: "邀请已确认，请使用刚设置的密码登录。",
  invite_only: "系统仅限受邀用户使用，请联系管理员获取邀请。",
  password_updated: "密码已更新，请使用新密码登录。",
}

export function buildAuthCallbackUrl(origin: string, next: string): string {
  const callbackUrl = new URL("/auth/callback", origin)
  callbackUrl.searchParams.set("next", resolveSafeRedirectPath(next))
  return callbackUrl.toString()
}

export function resolveAuthFeedback(
  errorCode: string | null | undefined,
  noticeCode: string | null | undefined
): AuthFeedback | null {
  if (errorCode && AUTH_ERRORS[errorCode]) {
    return { kind: "error", message: AUTH_ERRORS[errorCode] }
  }

  if (noticeCode && AUTH_NOTICES[noticeCode]) {
    return { kind: "success", message: AUTH_NOTICES[noticeCode] }
  }

  return null
}
