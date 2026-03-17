const Notification = require("../models/Notification");

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

    const notifications = await Notification.find(filter)
      .populate("sender", "firstName lastName name avatarUrl")
      .populate({
        path: "project",
        select: "orderId details projectLeadId assistantLeadId departments",
        populate: [
          { path: "projectLeadId", select: "firstName lastName name avatarUrl" },
          { path: "assistantLeadId", select: "firstName lastName name avatarUrl" },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);
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

    notification.isRead = true;
    await notification.save();

    res.json(notification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
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

    await Notification.updateMany(filter, { $set: { isRead: true } });

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
  markAllAsRead,
  clearNotifications,
};
