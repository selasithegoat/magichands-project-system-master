const EndOfDayReportDelivery = require("../models/EndOfDayReportDelivery");
const {
  DEFAULT_TIME_ZONE,
  formatFileDate,
  generateEndOfDayReport,
  loadEndOfDayReportData,
} = require("../services/endOfDayReportService");
const { sendEmailDetailed } = require("./emailService");

const DEFAULT_RECIPIENT = "scrum.mh@gmail.com";
const DEFAULT_SCHEDULE_TIME = "19:00";
const DEFAULT_SCHEDULE_DAYS = new Set([1, 2, 3, 4, 5, 6]);
const CHECK_INTERVAL_MS = 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const PROCESSING_LOCK_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const WEEKDAY_NUMBER_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const DAY_NAME_MAP = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const toText = (value) => String(value || "").trim();

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  return !["false", "0", "no", "off"].includes(
    String(value).trim().toLowerCase(),
  );
};

const parseRecipients = (value) => {
  const recipients = toText(value || DEFAULT_RECIPIENT)
    .split(/[;,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
  return Array.from(new Set(recipients));
};

const parseScheduleTime = (value) => {
  const candidate = toText(value || DEFAULT_SCHEDULE_TIME);
  const match = candidate.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hour: 19, minute: 0, label: DEFAULT_SCHEDULE_TIME };
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: 19, minute: 0, label: DEFAULT_SCHEDULE_TIME };
  }

  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
};

const parseScheduleDays = (value) => {
  const rawValue = toText(value);
  if (!rawValue) return new Set(DEFAULT_SCHEDULE_DAYS);

  const parsedDays = rawValue
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      if (/^[0-6]$/.test(entry)) return Number(entry);
      return DAY_NAME_MAP[entry];
    })
    .filter((entry) => Number.isInteger(entry));

  return parsedDays.length > 0
    ? new Set(parsedDays)
    : new Set(DEFAULT_SCHEDULE_DAYS);
};

const getSchedulerConfig = () => ({
  enabled: parseBoolean(process.env.EOD_REPORT_ENABLED, true),
  recipients: parseRecipients(process.env.EOD_REPORT_RECIPIENTS),
  timeZone: toText(process.env.EOD_REPORT_TIMEZONE) || DEFAULT_TIME_ZONE,
  scheduleTime: parseScheduleTime(process.env.EOD_REPORT_TIME),
  scheduleDays: parseScheduleDays(process.env.EOD_REPORT_DAYS),
  generatedBy: toText(process.env.EOD_REPORT_AUTHOR) || "Front Desk",
});

const getZonedClock = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    reportDate: `${values.year}-${values.month}-${values.day}`,
    weekday: WEEKDAY_NUMBER_MAP[values.weekday],
    hour: Number.parseInt(values.hour, 10),
    minute: Number.parseInt(values.minute, 10),
  };
};

const hasReachedSchedule = (clock, scheduleTime) =>
  clock.hour > scheduleTime.hour ||
  (clock.hour === scheduleTime.hour && clock.minute >= scheduleTime.minute);

const createDeliveryClaim = async ({
  reportDate,
  recipient,
  timeZone,
  scheduledTime,
  now,
}) => {
  try {
    return await EndOfDayReportDelivery.create({
      reportDate,
      recipient,
      timeZone,
      scheduledTime,
      status: "processing",
      attempts: 1,
      lockedAt: now,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const staleBefore = new Date(now.getTime() - PROCESSING_LOCK_TIMEOUT_MS);
  return EndOfDayReportDelivery.findOneAndUpdate(
    {
      reportDate,
      recipient,
      $or: [
        {
          status: "failed",
          attempts: { $lt: MAX_ATTEMPTS },
          nextAttemptAt: { $lte: now },
        },
        {
          status: "processing",
          attempts: { $lt: MAX_ATTEMPTS },
          lockedAt: { $lte: staleBefore },
        },
      ],
    },
    {
      $set: {
        status: "processing",
        timeZone,
        scheduledTime,
        lockedAt: now,
        nextAttemptAt: null,
        lastError: "",
      },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
};

const buildEmailHtml = ({ reportDate, projectCount }) => `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe3ef;">
            <tr>
              <td style="padding:22px 26px;background:#172338;color:#ffffff;">
                <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a3d900;">Magichands Co. Ltd.</div>
                <div style="margin-top:7px;font-size:25px;font-weight:800;">End of Day Scrum Update</div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px;">
                <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">The End of Day report for <strong>${reportDate}</strong> is attached.</p>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">The report contains ${projectCount} active project${projectCount === 1 ? "" : "s"} and the current Department Updates board.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();

const markClaimsSkipped = (claims, projectCount) =>
  Promise.all(
    claims.map((claim) =>
      EndOfDayReportDelivery.updateOne(
        { _id: claim._id, status: "processing" },
        {
          $set: {
            status: "skipped_empty",
            projectCount,
            lockedAt: null,
            nextAttemptAt: null,
            lastError: "",
          },
        },
      ),
    ),
  );

const markDeliveryFailed = async (claim, error, now) => {
  const attempts = Number(claim.attempts) || 1;
  const canRetry = attempts < MAX_ATTEMPTS;
  await EndOfDayReportDelivery.updateOne(
    { _id: claim._id, status: "processing" },
    {
      $set: {
        status: "failed",
        lockedAt: null,
        nextAttemptAt: canRetry
          ? new Date(now.getTime() + RETRY_DELAY_MS)
          : null,
        lastError: toText(error?.message || error).slice(0, 500),
      },
    },
  );
};

const sendClaimedReport = async ({
  claim,
  report,
  reportDate,
  projectCount,
  now,
}) => {
  const subject = `End of Day Scrum Update - ${reportDate}`;
  const text = `The End of Day Scrum Update for ${reportDate} is attached. It contains ${projectCount} active project${projectCount === 1 ? "" : "s"} and the current Department Updates board.`;

  try {
    const delivery = await sendEmailDetailed(claim.recipient, subject, text, {
      html: buildEmailHtml({ reportDate, projectCount }),
      messageId: `<eod-${claim.reportDate}-${claim.recipient.replace(
        /[^a-z0-9]/gi,
        "-",
      )}@magichands.local>`,
      attachments: [
        {
          filename: report.filename,
          content: report.buffer,
          contentType: report.contentType,
        },
      ],
    });

    if (!delivery.sent) {
      throw new Error("The email provider did not accept the report email.");
    }

    await EndOfDayReportDelivery.updateOne(
      { _id: claim._id, status: "processing" },
      {
        $set: {
          status: "sent",
          projectCount,
          filename: report.filename,
          messageId: delivery.messageId,
          sentAt: new Date(),
          lockedAt: null,
          nextAttemptAt: null,
          lastError: "",
        },
      },
    );
    return { recipient: claim.recipient, status: "sent" };
  } catch (error) {
    await markDeliveryFailed(claim, error, now);
    return {
      recipient: claim.recipient,
      status: "failed",
      error: toText(error?.message || error),
    };
  }
};

const runScheduledEndOfDayReport = async ({
  now = new Date(),
  force = false,
} = {}) => {
  const config = getSchedulerConfig();
  if (!config.enabled && !force) return { status: "disabled" };
  if (config.recipients.length === 0) return { status: "no_recipients" };

  let clock;
  try {
    clock = getZonedClock(now, config.timeZone);
  } catch (error) {
    console.error("End of Day report timezone is invalid:", error);
    return { status: "invalid_timezone" };
  }

  if (!force) {
    if (!config.scheduleDays.has(clock.weekday)) {
      return { status: "not_scheduled_today" };
    }
    if (!hasReachedSchedule(clock, config.scheduleTime)) {
      return { status: "not_due" };
    }
  }

  const claims = (
    await Promise.all(
      config.recipients.map((recipient) =>
        createDeliveryClaim({
          reportDate: clock.reportDate,
          recipient,
          timeZone: config.timeZone,
          scheduledTime: config.scheduleTime.label,
          now,
        }),
      ),
    )
  ).filter(Boolean);

  if (claims.length === 0) return { status: "already_processed" };

  try {
    const reportData = await loadEndOfDayReportData({ now });
    if (reportData.projectCount === 0) {
      await markClaimsSkipped(claims, 0);
      return { status: "skipped_empty", projectCount: 0 };
    }

    const report = await generateEndOfDayReport({
      ...reportData,
      now,
      timeZone: config.timeZone,
      generatedBy: config.generatedBy,
    });
    const deliveries = [];
    for (const claim of claims) {
      deliveries.push(
        await sendClaimedReport({
          claim,
          report,
          reportDate: report.reportDate,
          projectCount: reportData.projectCount,
          now,
        }),
      );
    }

    return {
      status: deliveries.every((delivery) => delivery.status === "sent")
        ? "sent"
        : "partially_failed",
      projectCount: reportData.projectCount,
      filename: report.filename,
      deliveries,
    };
  } catch (error) {
    await Promise.all(
      claims.map((claim) => markDeliveryFailed(claim, error, now)),
    );
    console.error("End of Day report generation failed:", error);
    return { status: "failed", error: toText(error?.message || error) };
  }
};

let schedulerTimer = null;
let schedulerRunning = false;

const checkSchedule = async () => {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const result = await runScheduledEndOfDayReport();
    if (
      ["sent", "partially_failed", "skipped_empty", "failed"].includes(
        result.status,
      )
    ) {
      console.log("End of Day report scheduler:", result);
    }
  } catch (error) {
    console.error("End of Day report scheduler failed:", error);
  } finally {
    schedulerRunning = false;
  }
};

const startEndOfDayReportScheduler = () => {
  if (schedulerTimer) return;

  const config = getSchedulerConfig();
  if (!config.enabled) {
    console.log("End of Day report scheduler is disabled.");
    return;
  }

  console.log(
    `End of Day report scheduler enabled for ${config.scheduleTime.label} ${config.timeZone}, days ${Array.from(
      config.scheduleDays,
    ).join(",")}, recipients ${config.recipients.join(", ")}.`,
  );

  const initialTimer = setTimeout(checkSchedule, 2000);
  initialTimer.unref?.();
  schedulerTimer = setInterval(checkSchedule, CHECK_INTERVAL_MS);
  schedulerTimer.unref?.();
};

module.exports = {
  getSchedulerConfig,
  getZonedClock,
  runScheduledEndOfDayReport,
  startEndOfDayReportScheduler,
};
