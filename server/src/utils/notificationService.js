const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendEmail } = require("./emailService");
const { broadcastNotificationChange } = require("./realtimeHub");
const { addProductionWorkingHours } = require("./productionActionWorkingTime");

const NOTIFICATION_DEDUPE_WINDOW_MS = Number.isFinite(
  Number.parseInt(process.env.NOTIFICATION_DEDUPE_WINDOW_MS, 10),
)
  ? Number.parseInt(process.env.NOTIFICATION_DEDUPE_WINDOW_MS, 10)
  : 20000;

/**
 * Create a new notification and trigger delivery channels based on user preferences
 * @param {string} recipientId - User ID of the recipient
 * @param {string} senderId - User ID of the sender
 * @param {string} projectId - ID of the related project (optional)
 * @param {string} type - Notification type enum
 * @param {string} title - Title of the notification
 * @param {string} message - Content of the notification
 */
const createNotification = async (
  recipientId,
  senderId,
  projectId,
  type,
  title,
  message,
  deliveryOptions = {},
) => {
  try {
    const recipientKey = recipientId?.toString?.() || "";
    const senderKey = senderId?.toString?.() || "";
    const projectKey = projectId?.toString?.() || null;
    const reminderKey = deliveryOptions?.reminderId?.toString?.() || null;
    const allowSelf = Boolean(deliveryOptions?.allowSelf);
    const sourceKey = String(deliveryOptions?.source || "").trim();
    const dedupeKey = String(deliveryOptions?.dedupeKey || "").trim();
    const productionActionType =
      sourceKey === "production_lead_follow_up:completion_due"
        ? "production_completion_review"
        : sourceKey === "production_completion_request:ready"
          ? "production_completion_request"
          : "";
    const actionStartedAt = productionActionType ? new Date() : null;

    if (!recipientKey || !senderKey) return null;

    // Avoid notifying the same user who performed the action unless explicitly allowed
    if (!allowSelf && recipientKey === senderKey) {
      return null;
    }

    // Fetch recipient to check notification preferences
    const recipient = await User.findById(recipientKey);
    if (!recipient) return null;

    const inAppEnabled = deliveryOptions?.inApp !== false;
    const emailOverride =
      typeof deliveryOptions?.email === "boolean"
        ? deliveryOptions.email
        : null;
    const pushOverride =
      typeof deliveryOptions?.push === "boolean" ? deliveryOptions.push : null;

    const normalizedReminderKey =
      reminderKey && mongoose.Types.ObjectId.isValid(reminderKey)
        ? reminderKey
        : null;

    let notification = null;
    let createdNewNotification = false;
    if (inAppEnabled) {
      // Guard against duplicate notifications from overlapping triggers
      const dedupeStart = new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS);
      const activeAction =
        productionActionType && projectKey
          ? await Notification.findOne({
              recipient: recipientKey,
              project: projectKey,
              source: sourceKey,
              isRead: false,
            })
              .sort({ createdAt: -1 })
              .lean()
          : null;
      const existing =
        activeAction ||
        (await Notification.findOne(
          dedupeKey
            ? { recipient: recipientKey, dedupeKey }
            : {
                recipient: recipientKey,
                project: projectKey,
                title,
                message,
                source: sourceKey,
                createdAt: { $gte: dedupeStart },
              },
        ).lean());
      if (existing) {
        if (productionActionType && existing.isRead) {
          notification = await Notification.findOneAndUpdate(
            { _id: existing._id },
            {
              $set: {
                isRead: false,
                seenAt: null,
                resolvedAt: null,
                title,
                message,
                requiresAction: true,
                priority: "urgent",
                actionType: productionActionType,
                actionUrl: deliveryOptions?.actionUrl || "/client",
                followUpStartedAt: actionStartedAt,
                reminderSentAt: null,
                escalatedAt: null,
                nextReminderAt: addProductionWorkingHours(actionStartedAt, 2),
                createdAt: actionStartedAt,
              },
            },
            { new: true },
          ).lean();
          createdNewNotification = true;
        } else {
          notification = existing;
        }
      } else {
        try {
          notification = await Notification.create({
            recipient: recipientKey,
            sender: senderKey,
            project: projectKey,
            reminder: normalizedReminderKey,
            type,
            title,
            message,
            source: sourceKey,
            requiresAction: Boolean(
              deliveryOptions?.requiresAction ?? productionActionType,
            ),
            priority:
              deliveryOptions?.priority ||
              (productionActionType
                ? "urgent"
                : ["ASSIGNMENT", "REMINDER", "REVISION"].includes(type)
                  ? "important"
                  : "informational"),
            actionType: deliveryOptions?.actionType || productionActionType,
            actionUrl:
              deliveryOptions?.actionUrl ||
              (productionActionType && projectKey
                ? "/client"
                : ""),
            followUpStartedAt: actionStartedAt,
            nextReminderAt: actionStartedAt
              ? addProductionWorkingHours(actionStartedAt, 2)
              : null,
            ...(dedupeKey ? { dedupeKey } : {}),
          });
          createdNewNotification = true;
        } catch (error) {
          if (error?.code !== 11000 || !dedupeKey) throw error;
          notification = await Notification.findOne({
            recipient: recipientKey,
            dedupeKey,
          }).lean();
        }
      }
    }

    if (createdNewNotification && notification?._id) {
      broadcastNotificationChange({
        path: "/api/notifications",
        method: "POST",
        source: "notification_service",
        portal: sourceKey,
        notificationId: String(notification._id),
        recipientId: recipientKey,
        type,
      });
    }

    // Check preferences and trigger delivery channels
    const settings = {
      email:
        emailOverride === null
          ? (recipient.notificationSettings?.email ?? false)
          : emailOverride,
      push:
        pushOverride === null
          ? (recipient.notificationSettings?.push ?? true)
          : pushOverride,
    };

    if (settings.email && recipient.email && (!inAppEnabled || createdNewNotification)) {
      await sendEmail(recipient.email, title, message);
    }

    if (settings.push) {
      // Stub for Push Notification Service
    }

    return notification;
  } catch (err) {
    console.error("Failed to create notification:", err);
    return null;
  }
};

module.exports = { createNotification };
