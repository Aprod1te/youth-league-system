import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import type { Database } from "@/lib/database.types"
import { resolveSafeRedirectPath } from "@/lib/navigation"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isInviteAcceptance = request.nextUrl.pathname === "/accept-invite"

  // Protect application routes and invitation completion.
  if (
    !user &&
    (request.nextUrl.pathname.startsWith("/dashboard") || isInviteAcceptance)
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    if (isInviteAcceptance) {
      url.searchParams.set("error", "invalid_auth_link")
    } else {
      url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`)
    }
    return NextResponse.redirect(url)
  }

  const unauthenticatedOnlyRoutes = new Set([
    "/login",
    "/register",
    "/forgot-password",
  ])

  // Redirect authenticated users away from pages intended for signed-out users.
  if (
    user &&
    unauthenticatedOnlyRoutes.has(request.nextUrl.pathname)
  ) {
    const nextPath = request.nextUrl.searchParams.get("next")
    const destination = resolveSafeRedirectPath(nextPath)
    return NextResponse.redirect(new URL(destination, request.url))
  }

  return supabaseResponse
}
