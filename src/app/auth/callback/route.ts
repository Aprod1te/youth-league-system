import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { resolveSafeRedirectPath } from "@/lib/navigation"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const flowId = request.nextUrl.searchParams.get("sb_flow_id")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const verificationType = request.nextUrl.searchParams.get("type")
  const supabase = await createClient()
  let verified = false

  if (tokenHash && verificationType === "invite") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "invite",
    })
    verified = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined
    )
    verified = !error
  }

  if (verified) {
    const nextPath = resolveSafeRedirectPath(
      request.nextUrl.searchParams.get("next"),
      verificationType === "invite" ? "/accept-invite" : "/dashboard"
    )
    return NextResponse.redirect(new URL(nextPath, request.url))
  }

  const errorUrl = request.nextUrl.clone()
  errorUrl.pathname = "/login"
  errorUrl.search = ""
  errorUrl.searchParams.set("error", "invalid_auth_link")
  return NextResponse.redirect(errorUrl)
}
