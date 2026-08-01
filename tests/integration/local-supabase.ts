import { execFileSync } from "node:child_process"

type SupabaseStatus = {
  ANON_KEY?: string
  API_URL?: string
  DB_URL?: string
  SERVICE_ROLE_KEY?: string
}

export type LocalSupabaseConfig = {
  anonKey: string
  apiUrl: string
  serviceRoleKey: string
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

function requireLoopbackUrl(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Local Supabase status did not include ${name}`)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`)
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run database integration tests against non-local ${name}: ${value}`
    )
  }
}

export function readLocalSupabaseConfig(): LocalSupabaseConfig {
  let output: string

  try {
    output = execFileSync(
      "npx",
      ["supabase", "status", "--output", "json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    )
  } catch {
    throw new Error(
      "Local Supabase is not running. Start it before running integration tests."
    )
  }

  let status: SupabaseStatus
  try {
    status = JSON.parse(output) as SupabaseStatus
  } catch {
    throw new Error("Could not parse local Supabase status output")
  }

  requireLoopbackUrl("API_URL", status.API_URL)
  requireLoopbackUrl("DB_URL", status.DB_URL)

  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase status did not include the required API keys")
  }

  return {
    anonKey: status.ANON_KEY,
    apiUrl: status.API_URL!,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  }
}
