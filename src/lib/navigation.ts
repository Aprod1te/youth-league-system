const INTERNAL_ORIGIN = "https://internal.invalid"
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/

export function resolveSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    CONTROL_CHARACTERS.test(candidate)
  ) {
    return fallback
  }

  try {
    const url = new URL(candidate, INTERNAL_ORIGIN)
    if (url.origin !== INTERNAL_ORIGIN) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
