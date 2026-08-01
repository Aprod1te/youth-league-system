export const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed"

export function getNotificationHref(
  type: string,
  relatedId: string | null
): string | null {
  switch (type) {
    case "application_review":
      return "/dashboard/applications"
    case "application":
      return "/dashboard/departments"
    case "activity_approval":
      return "/dashboard/activities/approval"
    case "activity":
      return relatedId
        ? `/dashboard/activities/${encodeURIComponent(relatedId)}`
        : "/dashboard/activities"
    case "task_approval":
      return "/dashboard/tasks/approval"
    case "task":
    case "task_assigned":
      return relatedId
        ? `/dashboard/tasks/${encodeURIComponent(relatedId)}`
        : "/dashboard/tasks"
    case "department":
      return relatedId
        ? `/dashboard/departments/${encodeURIComponent(relatedId)}`
        : "/dashboard/departments"
    default:
      return null
  }
}
