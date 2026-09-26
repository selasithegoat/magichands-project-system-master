export const PRODUCTION_ACTION_SOURCES = [
  "production_lead_follow_up:completion_due",
  "production_completion_request:ready",
];

export const isPendingActionNotification = (notification) =>
  Boolean(
    notification &&
      !notification.isRead &&
      (notification.requiresAction ||
        PRODUCTION_ACTION_SOURCES.includes(notification.source)),
  );

export const dedupePendingProjectActions = (notifications) => {
  const positions = new Map();
  const result = [];
  for (const notification of notifications) {
    const projectId = notification?.project?._id;
    if (
      !isPendingActionNotification(notification) ||
      !projectId ||
      !PRODUCTION_ACTION_SOURCES.includes(notification.source)
    ) {
      result.push(notification);
      continue;
    }
    const key = `${projectId}:${notification.source}`;
    const existingIndex = positions.get(key);
    if (existingIndex === undefined) {
      positions.set(key, result.length);
      result.push(notification);
      continue;
    }
    const review = notification.project?.productionTracking?.completionReview;
    const activeId =
      notification.source === "production_lead_follow_up:completion_due"
        ? review?.leadNotificationId
        : review?.ownerNotificationId;
    if (String(activeId || "") === String(notification._id)) {
      result[existingIndex] = notification;
    }
  }
  return result;
};

export const getNotificationActionLabel = (notification) => {
  switch (notification?.source) {
    case "production_lead_follow_up:completion_due":
      return "Answer completion check";
    case "production_completion_request:ready":
      return "Review & complete";
    default:
      return "Open action";
  }
};

export const markNotificationSeen = async (notificationId) => {
  if (!notificationId) return null;
  const response = await fetch(`/api/notifications/${notificationId}/seen`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!response.ok) return null;
  return response.json();
};
