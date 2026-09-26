const Notification = require("../models/Notification");

const ACTIONABLE_NOTIFICATION_SOURCES = [
  "production_lead_follow_up:completion_due",
  "production_completion_request:ready",
];
const unresolvedActionFilter = {
  $or: [
    { requiresAction: true, isRead: false },
    { source: { $in: ACTIONABLE_NOTIFICATION_SOURCES }, isRead: false },
  ],
};

const collapseDuplicateActiveActions = (notifications) => {
  const positions = new Map();
  const result = [];
  for (const notification of notifications) {
    const projectId = notification.project?._id?.toString?.();
    if (
      notification.isRead ||
      !projectId ||
      !ACTIONABLE_NOTIFICATION_SOURCES.includes(notification.source)
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

    // The project's active review points to the prompt that can still be answered.
    const review = notification.project?.productionTracking?.completionReview;
    const activeId =
      notification.source === "production_lead_follow_up:completion_due"
        ? review?.leadNotificationId
        : review?.ownerNotificationId;
    if (activeId?.toString?.() === notification._id?.toString?.()) {
      result[existingIndex] = notification;
    }
  }
  return result;
};

const parseSourceList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const applySourceFilter = (filter, { source, excludeSource }) => {
  const includeSources = parseSourceList(source);
  const excludeSources = parseSourceList(excludeSource);

  if (includeSources.length) {
    filter.source =
      includeSources.length === 1 ? includeSources[0] : { $in: includeSources };
    return;
  }

  if (excludeSources.length) {
    filter.source = { $nin: excludeSources };
  }
};

// @desc    Get all notifications for logged-in user
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const filter = { recipient: req.user._id };
    applySourceFilter(filter, {
      source: req.query.source,
      excludeSource: req.query.excludeSource,
    });
    if (String(req.query.pendingActions || "") === "true") {
      filter.isRead = false;
      filter.$or = [
        { requiresAction: true },
        { source: { $in: ACTIONABLE_NOTIFICATION_SOURCES } },
      ];
    }

    const notifications = await Notification.find(filter)
      .populate("sender", "firstName lastName name avatarUrl")
      .populate({
        path: "project",
        select: "orderId details projectLeadId assistantLeadId departments productionTracking.completionReview.leadNotificationId productionTracking.completionReview.ownerNotificationId",
        populate: [
          { path: "projectLeadId", select: "firstName lastName name avatarUrl" },
          { path: "assistantLeadId", select: "firstName lastName name avatarUrl" },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(req.query.pendingActions === "true" ? 200 : 50);

    res.json(collapseDuplicateActiveActions(notifications));
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Mark a single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (
      notification.requiresAction ||
      ACTIONABLE_NOTIFICATION_SOURCES.includes(notification.source)
    ) {
      return res.status(409).json({
        message: "Complete the required action before resolving this notification.",
      });
    }

    notification.isRead = true;
    notification.seenAt ||= new Date();
    notification.resolvedAt = new Date();
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Opening a required action records that it was seen without resolving it.
const markAsSeen = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id,
    });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    if (!notification.seenAt) {
      notification.seenAt = new Date();
      await notification.save();
    }
    res.json(notification);
  } catch (error) {
    console.error("Error marking notification as seen:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Mark all notifications as read for logged-in user
// @route   PATCH /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const filter = { recipient: req.user._id, isRead: false };
    applySourceFilter(filter, {
      source: req.query.source,
      excludeSource: req.query.excludeSource,
    });
    filter.$nor = [unresolvedActionFilter];

    const now = new Date();
    await Notification.updateMany(filter, {
      $set: { isRead: true, seenAt: now, resolvedAt: now },
    });

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Clear all notifications for logged-in user
// @route   DELETE /api/notifications
// @access  Private
const clearNotifications = async (req, res) => {
  try {
    const filter = { recipient: req.user._id };
    applySourceFilter(filter, {
      source: req.query.source,
      excludeSource: req.query.excludeSource,
    });
    filter.$nor = [unresolvedActionFilter];

    await Notification.deleteMany(filter);
    res.json({ message: "Notifications cleared" });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAsSeen,
  markAllAsRead,
  clearNotifications,
};
