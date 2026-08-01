const UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i

export function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  )
}

export function isExternalFileUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export function sanitizeStorageFileName(name: string, maxLength = 120): string {
  const normalized = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^\.+/, "")
    .replace(/_+/g, "_")

  const fallback = normalized || "file"
  if (fallback.length <= maxLength) return fallback

  const extensionIndex = fallback.lastIndexOf(".")
  const extension =
    extensionIndex > 0 && fallback.length - extensionIndex <= 16
      ? fallback.slice(extensionIndex)
      : ""
  return `${fallback.slice(0, maxLength - extension.length)}${extension}`
}

export function getStorageDisplayName(value: string): string {
  let path = value
  if (isExternalFileUrl(value)) {
    path = new URL(value).pathname
  }

  const rawName = path.split("/").filter(Boolean).at(-1) || "文件"
  let decodedName = rawName
  try {
    decodedName = decodeURIComponent(rawName)
  } catch {
    // Keep the original basename when a legacy URL contains invalid escapes.
  }

  return decodedName.replace(UUID_PREFIX, "") || "文件"
}
