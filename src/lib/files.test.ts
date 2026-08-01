import { describe, expect, it } from "vitest"
import {
  getStorageDisplayName,
  getStringArray,
  isExternalFileUrl,
  sanitizeStorageFileName,
} from "./files"

describe("getStringArray", () => {
  it("keeps only non-empty strings", () => {
    expect(getStringArray(["a/b.jpg", null, 3, "", "c/d.pdf"])).toEqual([
      "a/b.jpg",
      "c/d.pdf",
    ])
  })

  it("returns an empty array for non-array JSON", () => {
    expect(getStringArray({ path: "a/b.jpg" })).toEqual([])
  })
})

describe("storage file paths", () => {
  it("recognizes only HTTP(S) legacy URLs", () => {
    expect(isExternalFileUrl("https://cdn.example/report.pdf")).toBe(true)
    expect(isExternalFileUrl("javascript:alert(1)")).toBe(false)
    expect(isExternalFileUrl("activity-id/report.pdf")).toBe(false)
  })

  it("preserves safe Chinese names and removes path separators", () => {
    expect(sanitizeStorageFileName("../活动 总结(终稿).pdf")).toBe(
      "_活动_总结_终稿_.pdf"
    )
  })

  it("removes generated UUID prefixes from display names", () => {
    expect(
      getStorageDisplayName(
        "activity-id/123e4567-e89b-42d3-a456-426614174000-活动总结.pdf"
      )
    ).toBe("活动总结.pdf")
  })

  it("extracts and decodes legacy URL basenames", () => {
    expect(
      getStorageDisplayName("https://cdn.example/files/%E6%80%BB%E7%BB%93.pdf?x=1")
    ).toBe("总结.pdf")
  })
})
